import type { RawJob } from '../../../packages/shared/src/domain.ts';
import type { JobSource } from '../../../packages/site-adapters/src/index.ts';
import { openLocalWorkerPayload } from '../../orchestrator/src/wuzzuf-tool-service.ts';
import { WorkerError, type WorkerJobHandler } from './worker-runtime.ts';

interface SearchRequest { action: 'searchJobs'; input: { criteria: { queries: string[]; locations: string[] } } }
export function createGenericSearchHandler(source: JobSource, workerToken: string): WorkerJobHandler {
  return async (job, context): Promise<RawJob[]> => {
    let request: SearchRequest; try { request = openLocalWorkerPayload<SearchRequest>(job.payload, workerToken); } catch { throw new WorkerError('WORKER_AUTHENTICATION_FAILED', false, 'Search request authentication failed'); }
    const criteria = request?.input?.criteria; if (request.action !== 'searchJobs' || !Array.isArray(criteria?.queries) || !Array.isArray(criteria.locations) || !criteria.queries.length || !criteria.locations.length) throw new WorkerError('INVALID_WORKER_REQUEST', false, 'Invalid generic search request');
    context.signal.throwIfAborted(); context.progress(10, 'discovering jobs through enabled worker connectors'); const results = await source.discover({ queries: criteria.queries.slice(0, 10), locations: criteria.locations.slice(0, 10) }); context.signal.throwIfAborted(); context.progress(90, 'sanitizing discovery results', { count: results.length }); return results;
  };
}

