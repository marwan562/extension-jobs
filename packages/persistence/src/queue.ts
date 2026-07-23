import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { QueueJob, QueueJobType } from '../../shared-contracts/src/index.ts';

type Row = { id: string; type: QueueJobType; payload: string; status: QueueJob['status']; attempts: number; max_attempts: number; run_after: string; locked_by: string | null; locked_at: string | null; correlation_id: string; created_at: string; updated_at: string };
const fromRow = (row: Row): QueueJob => ({ id: row.id, type: row.type, payload: JSON.parse(row.payload) as unknown, status: row.status, attempts: row.attempts, maxAttempts: row.max_attempts, runAfter: row.run_after, ...(row.locked_by ? { lockedBy: row.locked_by } : {}), ...(row.locked_at ? { lockedAt: row.locked_at } : {}), correlationId: row.correlation_id, createdAt: row.created_at, updatedAt: row.updated_at });

export class DurableQueue {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }
  enqueue(type: QueueJobType, payload: unknown, options: { correlationId?: string; maxAttempts?: number; runAfter?: string } = {}): QueueJob {
    const now = new Date().toISOString(); const isSubmission = type === 'wuzzuf.submit-application' || type === 'application.submit';
    const job: QueueJob = { id: randomUUID(), type, payload, status: 'queued', attempts: 0, maxAttempts: isSubmission ? 1 : options.maxAttempts ?? 3, runAfter: options.runAfter ?? now, correlationId: options.correlationId ?? randomUUID(), createdAt: now, updatedAt: now };
    this.db.prepare('INSERT INTO queue_jobs (id,type,payload,status,attempts,max_attempts,run_after,correlation_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(job.id, job.type, JSON.stringify(job.payload), job.status, 0, job.maxAttempts, job.runAfter, job.correlationId, now, now); return job;
  }
  claim(workerId: string, leaseMs = 60_000): QueueJob | undefined {
    const now = new Date(); const expired = new Date(now.getTime() - leaseMs).toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare("SELECT * FROM queue_jobs WHERE ((status='queued' AND run_after<=?) OR (status='running' AND locked_at<?)) AND attempts<max_attempts ORDER BY run_after, created_at LIMIT 1").get(now.toISOString(), expired) as Row | undefined;
      if (!row) { this.db.exec('COMMIT'); return undefined; }
      const updated = this.db.prepare("UPDATE queue_jobs SET status='running', attempts=attempts+1, locked_by=?, locked_at=?, updated_at=? WHERE id=? AND (status='queued' OR locked_at<?)").run(workerId, now.toISOString(), now.toISOString(), row.id, expired);
      this.db.exec('COMMIT'); if (updated.changes !== 1) return undefined;
      return fromRow(this.db.prepare('SELECT * FROM queue_jobs WHERE id=?').get(row.id) as Row);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(id: string): QueueJob | undefined { const row = this.db.prepare('SELECT * FROM queue_jobs WHERE id=?').get(id) as Row | undefined; return row ? fromRow(row) : undefined; }
  heartbeat(id: string, workerId: string): boolean { const now = new Date().toISOString(); return this.db.prepare("UPDATE queue_jobs SET locked_at=?,updated_at=? WHERE id=? AND status='running' AND locked_by=?").run(now, now, id, workerId).changes === 1; }
  progress(id: string, workerId: string, progress: number, message: string, detail: Record<string, unknown> = {}): boolean {
    const job = this.db.prepare("SELECT id FROM queue_jobs WHERE id=? AND status='running' AND locked_by=?").get(id, workerId); if (!job) return false;
    const now = new Date().toISOString(); this.db.prepare('INSERT INTO queue_progress_events VALUES (?,?,?,?,?,?)').run(randomUUID(), id, Math.max(0, Math.min(100, Math.round(progress))), message.slice(0, 500), JSON.stringify(detail), now); return true;
  }
  progressEvents(id: string): Array<{ progress: number; message: string; detail: Record<string, unknown>; createdAt: string }> { return (this.db.prepare('SELECT progress,message,detail,created_at FROM queue_progress_events WHERE queue_job_id=? ORDER BY created_at,rowid').all(id) as Array<{ progress: number; message: string; detail: string; created_at: string }>).map((row) => ({ progress: row.progress, message: row.message, detail: JSON.parse(row.detail) as Record<string, unknown>, createdAt: row.created_at })); }
  completeWithResult(id: string, workerId: string, result: unknown): boolean { this.db.exec('BEGIN IMMEDIATE'); try { const completed = this.complete(id, workerId); if (!completed) { this.db.exec('ROLLBACK'); return false; } this.db.prepare("INSERT INTO queue_results VALUES (?, 'completed', ?, NULL, ?) ON CONFLICT(queue_job_id) DO UPDATE SET status=excluded.status,result=excluded.result,error_code=NULL,updated_at=excluded.updated_at").run(id, JSON.stringify(result), new Date().toISOString()); this.db.exec('COMMIT'); return true; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  result(id: string): { status: string; result?: unknown; errorCode?: string; updatedAt: string } | undefined { const row = this.db.prepare('SELECT status,result,error_code,updated_at FROM queue_results WHERE queue_job_id=?').get(id) as { status: string; result: string | null; error_code: string | null; updated_at: string } | undefined; return row ? { status: row.status, ...(row.result ? { result: JSON.parse(row.result) as unknown } : {}), ...(row.error_code ? { errorCode: row.error_code } : {}), updatedAt: row.updated_at } : undefined; }
  requestCancellation(id: string, actor = 'user'): boolean { const job = this.get(id); if (!job || !['queued', 'running'].includes(job.status)) return false; const now = new Date().toISOString(); this.db.prepare('INSERT INTO queue_cancellations VALUES (?,?,?) ON CONFLICT(queue_job_id) DO NOTHING').run(id, now, actor.slice(0, 100)); if (job.status === 'queued') this.cancel(id); return true; }
  requestCancellationAll(actor = 'emergency-stop'): number { const rows = this.db.prepare("SELECT id FROM queue_jobs WHERE status IN ('queued','running')").all() as Array<{ id: string }>; let count = 0; for (const row of rows) if (this.requestCancellation(row.id, actor)) count += 1; return count; }
  cancellationRequested(id: string): boolean { return Boolean(this.db.prepare('SELECT queue_job_id FROM queue_cancellations WHERE queue_job_id=?').get(id)); }
  claimById(id: string, workerId: string): QueueJob | undefined { const now = new Date().toISOString(); const updated = this.db.prepare("UPDATE queue_jobs SET status='running',attempts=attempts+1,locked_by=?,locked_at=?,updated_at=? WHERE id=? AND status='queued' AND run_after<=? AND attempts<max_attempts").run(workerId, now, now, id, now); if (updated.changes !== 1) return undefined; return fromRow(this.db.prepare('SELECT * FROM queue_jobs WHERE id=?').get(id) as Row); }
  complete(id: string, workerId: string): boolean { return this.db.prepare("UPDATE queue_jobs SET status='completed', locked_by=NULL, locked_at=NULL, updated_at=? WHERE id=? AND status='running' AND locked_by=?").run(new Date().toISOString(), id, workerId).changes === 1; }
  fail(id: string, workerId: string, errorCode: string, retryable: boolean): boolean {
    const row = this.db.prepare('SELECT attempts,max_attempts,type FROM queue_jobs WHERE id=? AND locked_by=?').get(id, workerId) as { attempts: number; max_attempts: number; type: QueueJobType } | undefined; if (!row) return false;
    const mayRetry = retryable && row.type !== 'wuzzuf.submit-application' && row.type !== 'application.submit' && row.attempts < row.max_attempts; const delay = Math.min(300_000, 1000 * 2 ** Math.max(0, row.attempts - 1));
    const status = mayRetry ? 'queued' : 'failed'; const now = new Date().toISOString(); const changed = this.db.prepare('UPDATE queue_jobs SET status=?,run_after=?,locked_by=NULL,locked_at=NULL,last_error=?,updated_at=? WHERE id=? AND locked_by=?').run(status, new Date(Date.now() + delay).toISOString(), errorCode, now, id, workerId).changes === 1;
    if (changed && !mayRetry) this.db.prepare("INSERT INTO queue_results VALUES (?, 'failed', NULL, ?, ?) ON CONFLICT(queue_job_id) DO UPDATE SET status=excluded.status,result=NULL,error_code=excluded.error_code,updated_at=excluded.updated_at").run(id, errorCode, now); return changed;
  }
  cancel(id: string): boolean { return this.db.prepare("UPDATE queue_jobs SET status='cancelled',locked_by=NULL,locked_at=NULL,updated_at=? WHERE id=? AND status IN ('queued','running')").run(new Date().toISOString(), id).changes === 1; }
  health() { const rows = this.db.prepare('SELECT status,COUNT(*) count FROM queue_jobs GROUP BY status').all() as Array<{ status: string; count: number }>; return Object.fromEntries(rows.map((row) => [row.status, row.count])); }
}
