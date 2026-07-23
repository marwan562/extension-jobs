import type { QueueJobType } from '../../../packages/shared-contracts/src/index.ts';
import { WuzzufToolError, type WuzzufSearchInput } from '../../../packages/shared/src/wuzzuf.ts';
import type { OrchestratorService } from '../../orchestrator/src/service.ts';
import { openWorkerRequest } from '../../orchestrator/src/wuzzuf-tool-service.ts';
import { WorkerError, type WorkerJobHandler } from './worker-runtime.ts';

export function createWuzzufWorkerHandlers(service: OrchestratorService, workerToken: string): Map<QueueJobType, WorkerJobHandler> {
  const handler: WorkerJobHandler = async (job, context) => {
    context.progress(5, 'authenticated worker request'); const request = openWorkerRequest(job.payload, workerToken); context.signal.throwIfAborted();
    try {
      let result: unknown;
      switch (request.action) {
        case 'search': result = await service.wuzzuf.search(request.input as WuzzufSearchInput); break;
        case 'details': result = await service.wuzzuf.details(requiredRecord(request.input).url as string); break;
        case 'score': result = await service.wuzzuf.score(request.input as Parameters<OrchestratorService['wuzzuf']['score']>[0]); break;
        case 'prepare': result = await service.wuzzuf.prepare(request.input as Parameters<OrchestratorService['wuzzuf']['prepare']>[0]); break;
        case 'fill': result = await service.wuzzuf.fill(request.input as Parameters<OrchestratorService['wuzzuf']['fill']>[0]); break;
        case 'submit': result = await service.wuzzuf.submit(request.input as Parameters<OrchestratorService['wuzzuf']['submit']>[0]); break;
        case 'cancel': result = await service.wuzzuf.cancel(request.input as Parameters<OrchestratorService['wuzzuf']['cancel']>[0]); break;
        case 'verifyConnection': result = await service.wuzzuf.verifyConnection(); break;
        case 'createConnection': result = await service.wuzzuf.createConnection(); break;
        case 'disconnect': result = await service.wuzzuf.disconnect(); break;
        case 'openLogin': result = await service.wuzzuf.openLogin(); break;
      }
      context.progress(95, 'browser operation completed'); return result;
    } catch (error) { if (error instanceof WuzzufToolError) throw new WorkerError(error.code, error.retryable, error.message); throw error; }
  };
  return new Map<QueueJobType, WorkerJobHandler>([
    ['wuzzuf.verify-auth', handler], ['wuzzuf.search', handler], ['wuzzuf.fetch-details', handler], ['wuzzuf.score-job', handler],
    ['wuzzuf.prepare-application', handler], ['wuzzuf.fill-application', handler], ['wuzzuf.submit-application', handler], ['wuzzuf.cleanup-browser', handler]
  ]);
}

function requiredRecord(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkerError('APPLICATION_INPUT_REQUIRED', false, 'Worker action input must be an object'); return value as Record<string, unknown>; }
