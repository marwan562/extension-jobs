import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentSettings, ApplicationState, AuditEvent, CandidateProfile, Job, JobCampaign } from '../../../packages/shared/src/domain.ts';
import type { ApprovalTokenRecord, PreparedApplicationRecord } from '../../../packages/shared/src/wuzzuf.ts';
import { assertTransition } from '../../../packages/shared/src/validation.ts';

export class Store {
  private readonly db: DatabaseSync;
  constructor(path: string) { mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path); this.migrate(); }
  private migrate(): void {
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, state TEXT NOT NULL, submission_key TEXT UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, application_id TEXT, at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS approval_tokens (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS resume_files (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, source_name TEXT NOT NULL, content BLOB NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locks (key TEXT PRIMARY KEY, acquired_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_correlation_idx ON audit_events(correlation_id, at);`);
  }
  saveProfile(profile: CandidateProfile): void { this.db.prepare('INSERT INTO profiles VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(profile.id, JSON.stringify(profile), profile.updatedAt); }
  getProfile(id: string): CandidateProfile | undefined { const row = this.db.prepare('SELECT data FROM profiles WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as CandidateProfile : undefined; }
  listProfiles(): CandidateProfile[] { return (this.db.prepare('SELECT data FROM profiles ORDER BY updated_at DESC').all() as Array<{ data: string }>).map((r) => JSON.parse(r.data) as CandidateProfile); }
  saveResumeFile(profileId: string, resumeId: string, sourceName: string, content: Uint8Array): void { this.db.prepare('INSERT INTO resume_files VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET content=excluded.content, source_name=excluded.source_name').run(resumeId, profileId, sourceName, Buffer.from(content), new Date().toISOString()); }
  getResumeFile(profileId: string, resumeId: string): { sourceName: string; content: Uint8Array } | undefined { const row = this.db.prepare('SELECT source_name, content FROM resume_files WHERE id=? AND profile_id=?').get(resumeId, profileId) as { source_name: string; content: Uint8Array } | undefined; return row ? { sourceName: row.source_name, content: row.content } : undefined; }
  saveAgentSettings(settings: AgentSettings): void { this.db.prepare('INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run('agents', JSON.stringify(settings)); }
  getAgentSettings(): AgentSettings | undefined { const row = this.db.prepare('SELECT data FROM settings WHERE key=?').get('agents') as { data: string } | undefined; return row ? JSON.parse(row.data) as AgentSettings : undefined; }
  saveCampaign(campaign: JobCampaign): void { this.db.prepare('INSERT INTO campaigns VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(campaign.id, JSON.stringify(campaign), campaign.updatedAt); }
  getCampaign(id: string): JobCampaign | undefined { const row = this.db.prepare('SELECT data FROM campaigns WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as JobCampaign : undefined; }
  listCampaigns(): JobCampaign[] { return (this.db.prepare('SELECT data FROM campaigns ORDER BY updated_at DESC').all() as Array<{ data: string }>).map((r) => JSON.parse(r.data) as JobCampaign); }
  saveJob(job: Job): boolean { try { this.db.prepare('INSERT INTO jobs VALUES (?, ?, ?)').run(job.id, job.fingerprint, JSON.stringify(job)); return true; } catch (e) { if (String(e).includes('UNIQUE')) return false; throw e; } }
  upsertJob(job: Job): Job { const existing = this.getJobBySource(job.source, job.sourceId); if (existing) { const updated = { ...job, id: existing.id, fingerprint: existing.fingerprint }; this.db.prepare('UPDATE jobs SET data=? WHERE id=?').run(JSON.stringify(updated), existing.id); return updated; } this.saveJob(job); return job; }
  getJob(id: string): Job | undefined { const row = this.db.prepare('SELECT data FROM jobs WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as Job : undefined; }
  getJobByUrl(url: string): Job | undefined { const rows = this.db.prepare('SELECT data FROM jobs').all() as Array<{ data: string }>; return rows.map((row) => JSON.parse(row.data) as Job).find((job) => job.url === url); }
  getJobBySource(source: string, sourceId: string): Job | undefined { const rows = this.db.prepare('SELECT data FROM jobs').all() as Array<{ data: string }>; return rows.map((row) => JSON.parse(row.data) as Job).find((job) => job.source === source && job.sourceId === sourceId); }
  createApplication(id: string, jobId: string, data: Record<string, unknown>): void { this.db.prepare('INSERT INTO applications VALUES (?, ?, ?, NULL, ?)').run(id, jobId, 'DISCOVERED', JSON.stringify(data)); }
  savePreparedApplication(record: PreparedApplicationRecord): void { this.db.prepare('INSERT INTO applications (id, job_id, state, submission_key, data) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state, data=excluded.data').run(record.id, record.jobId, record.state, JSON.stringify(record)); }
  getPreparedApplication(id: string): PreparedApplicationRecord | undefined { const row = this.db.prepare('SELECT data, state FROM applications WHERE id=?').get(id) as { data: string; state: ApplicationState } | undefined; if (!row) return undefined; return { ...(JSON.parse(row.data) as PreparedApplicationRecord), state: row.state }; }
  getPreparedApplicationByJob(jobId: string): PreparedApplicationRecord | undefined { const row = this.db.prepare('SELECT data, state FROM applications WHERE job_id=? ORDER BY rowid DESC LIMIT 1').get(jobId) as { data: string; state: ApplicationState } | undefined; if (!row) return undefined; return { ...(JSON.parse(row.data) as PreparedApplicationRecord), state: row.state }; }
  transition(id: string, to: ApplicationState): void { const row = this.db.prepare('SELECT state FROM applications WHERE id=?').get(id) as { state: ApplicationState } | undefined; if (!row) throw new Error('Application not found'); assertTransition(row.state, to); this.db.prepare('UPDATE applications SET state=? WHERE id=?').run(to, id); }
  reserveSubmission(id: string, key: string): boolean { try { const result = this.db.prepare('UPDATE applications SET submission_key=? WHERE id=? AND submission_key IS NULL').run(key, id); return result.changes === 1; } catch (e) { if (String(e).includes('UNIQUE')) return false; throw e; } }
  saveApprovalToken(record: ApprovalTokenRecord): void { this.db.prepare('INSERT INTO approval_tokens VALUES (?, ?, ?, ?, NULL, ?)').run(record.id, record.applicationId, record.tokenHash, record.expiresAt, JSON.stringify(record)); }
  consumeApprovalToken(applicationId: string, tokenHash: string, now: string): 'valid' | 'missing' | 'expired' | 'used' | 'mismatched' {
    const row = this.db.prepare('SELECT id, application_id, expires_at, used_at FROM approval_tokens WHERE token_hash=?').get(tokenHash) as { id: string; application_id: string; expires_at: string; used_at: string | null } | undefined;
    if (!row) return 'missing'; if (row.application_id !== applicationId) return 'mismatched'; if (row.used_at) return 'used'; if (Date.parse(row.expires_at) <= Date.parse(now)) return 'expired';
    const result = this.db.prepare('UPDATE approval_tokens SET used_at=? WHERE id=? AND used_at IS NULL').run(now, row.id); return result.changes === 1 ? 'valid' : 'used';
  }
  audit(event: AuditEvent): void { this.db.prepare('INSERT INTO audit_events VALUES (?, ?, ?, ?, ?)').run(event.id, event.correlationId, event.applicationId ?? null, event.at, JSON.stringify(event)); }
  timeline(correlationId?: string): AuditEvent[] { const rows = correlationId ? this.db.prepare('SELECT data FROM audit_events WHERE correlation_id=? ORDER BY at').all(correlationId) : this.db.prepare('SELECT data FROM audit_events ORDER BY at DESC LIMIT 200').all(); return (rows as Array<{ data: string }>).map((r) => JSON.parse(r.data) as AuditEvent); }
  applicationTimeline(applicationId: string): AuditEvent[] { return (this.db.prepare('SELECT data FROM audit_events WHERE application_id=? ORDER BY at').all(applicationId) as Array<{ data: string }>).map((row) => JSON.parse(row.data) as AuditEvent); }
  acquireLock(key: string): boolean { try { this.db.prepare('INSERT INTO locks VALUES (?, ?)').run(key, new Date().toISOString()); return true; } catch { return false; } }
  releaseLock(key: string): void { this.db.prepare('DELETE FROM locks WHERE key=?').run(key); }
  close(): void { this.db.close(); }
}
