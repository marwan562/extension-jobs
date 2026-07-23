import type { QueueJobType } from '../../../packages/shared-contracts/src/index.ts';
import { WuzzufToolError } from '../../../packages/shared/src/wuzzuf.ts';
import { sealLocalWorkerPayload } from './wuzzuf-tool-service.ts';
import type { Store } from './store.ts';

export class LocalWorkerClient {
  private readonly store: Store;
  private readonly token: string;
  private readonly timeoutMs: number;
  constructor(store: Store, token: string, timeoutMs = 300_000) {
    if (token.length < 32) throw new Error('A 32+ character worker token is required');
    this.store = store; this.token = token; this.timeoutMs = timeoutMs;
  }
  async execute<T>(type: QueueJobType, action: string, input: unknown): Promise<T> {
    const queued = this.store.queue.enqueue(type, sealLocalWorkerPayload({ action, input }, this.token));
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const result = this.store.queue.result(queued.id);
      if (result?.status === 'completed') return result.result as T;
      if (result?.status === 'failed') throw new WuzzufToolError(result.errorCode ?? 'WORKER_OPERATION_FAILED', 'The standalone worker failed the operation', { status: 409 });
      const job = this.store.queue.get(queued.id);
      if (job?.status === 'cancelled') throw new WuzzufToolError('OPERATION_CANCELLED', 'The worker operation was cancelled', { status: 409 });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    this.store.queue.requestCancellation(queued.id, 'orchestrator-timeout');
    throw new WuzzufToolError('WORKER_UNAVAILABLE', 'Timed out waiting for the standalone worker', { status: 504, retryable: true });
  }
}

