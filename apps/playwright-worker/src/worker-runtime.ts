import type { QueueJob, QueueJobType } from '../../../packages/shared-contracts/src/index.ts';
import type { DurableQueue } from '../../../packages/persistence/src/queue.ts';

export interface WorkerJobContext {
  signal: AbortSignal;
  progress(percent: number, message: string, detail?: Record<string, unknown>): void;
  heartbeat(): void;
}
export type WorkerJobHandler = (job: QueueJob, context: WorkerJobContext) => Promise<unknown>;

export class BrowserWorkerRuntime {
  private readonly queue: DurableQueue; private readonly workerId: string; private readonly handlers: ReadonlyMap<QueueJobType, WorkerJobHandler>;
  private readonly leaseMs: number; private readonly pollMs: number; private timer: NodeJS.Timeout | undefined; private stopping = false;
  private readonly active = new Map<string, AbortController>();
  constructor(queue: DurableQueue, options: { workerId: string; handlers: ReadonlyMap<QueueJobType, WorkerJobHandler>; leaseMs?: number; pollMs?: number }) { this.queue = queue; this.workerId = options.workerId; this.handlers = options.handlers; this.leaseMs = options.leaseMs ?? 30_000; this.pollMs = options.pollMs ?? 250; }
  start(): void { if (this.timer) return; this.stopping = false; this.timer = setInterval(() => void this.pollOnce(), this.pollMs); this.timer.unref(); void this.pollOnce(); }
  async stop(): Promise<void> { this.stopping = true; if (this.timer) clearInterval(this.timer); this.timer = undefined; for (const controller of this.active.values()) controller.abort(new Error('Worker shutdown')); while (this.active.size) await new Promise((resolve) => setTimeout(resolve, 10)); }
  async pollOnce(): Promise<boolean> {
    if (this.stopping || this.active.size) return false;
    const job = this.queue.claim(this.workerId, this.leaseMs); if (!job) return false;
    const controller = new AbortController(); this.active.set(job.id, controller);
    const heartbeat = setInterval(() => { if (!this.queue.heartbeat(job.id, this.workerId)) controller.abort(new Error('Worker lease lost')); if (this.queue.cancellationRequested(job.id)) controller.abort(new Error('Operation cancelled')); }, Math.max(100, Math.floor(this.leaseMs / 3))); heartbeat.unref();
    try {
      if (this.queue.cancellationRequested(job.id)) throw operationCancelled();
      const handler = this.handlers.get(job.type); if (!handler) throw new WorkerError('AUTOMATION_NOT_PERMITTED', false, `No worker handler for ${job.type}`);
      this.queue.progress(job.id, this.workerId, 0, 'started');
      const result = await handler(job, { signal: controller.signal, heartbeat: () => { if (!this.queue.heartbeat(job.id, this.workerId)) throw new WorkerError('WORKFLOW_STATE_CONFLICT', true, 'Worker lease lost'); }, progress: (percent, message, detail = {}) => { if (!this.queue.progress(job.id, this.workerId, percent, message, detail)) throw new WorkerError('WORKFLOW_STATE_CONFLICT', true, 'Worker lease lost'); } });
      controller.signal.throwIfAborted(); this.queue.progress(job.id, this.workerId, 100, 'completed');
      if (!this.queue.completeWithResult(job.id, this.workerId, result)) throw new WorkerError('WORKFLOW_STATE_CONFLICT', true, 'Worker could not persist completion');
      return true;
    } catch (error) {
      const cancelled = controller.signal.aborted || this.queue.cancellationRequested(job.id) || (error instanceof WorkerError && error.code === 'OPERATION_CANCELLED');
      if (cancelled) this.queue.cancel(job.id); else this.queue.fail(job.id, this.workerId, error instanceof WorkerError ? error.code : 'INTERNAL_ERROR', error instanceof WorkerError && error.retryable);
      return true;
    } finally { clearInterval(heartbeat); this.active.delete(job.id); }
  }
}

export class WorkerError extends Error {
  readonly code: string; readonly retryable: boolean;
  constructor(code: string, retryable: boolean, message: string) { super(message); this.code = code; this.retryable = retryable; }
}
function operationCancelled(): WorkerError { return new WorkerError('OPERATION_CANCELLED', false, 'Operation cancelled'); }
