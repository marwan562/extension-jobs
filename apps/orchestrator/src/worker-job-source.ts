import type { RawJob } from '../../../packages/shared/src/domain.ts';
import type { JobSource } from '../../../packages/site-adapters/src/index.ts';
import type { LocalWorkerClient } from './worker-client.ts';

export class WorkerJobSource implements JobSource {
  readonly id = 'standalone-worker'; private readonly worker: LocalWorkerClient;
  constructor(worker: LocalWorkerClient) { this.worker = worker; }
  discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> { return this.worker.execute<RawJob[]>('jobs.search', 'searchJobs', { criteria }); }
}

