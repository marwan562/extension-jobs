import { resolve } from 'node:path';
import type { Artifact, QueueJob } from '../../../packages/shared-contracts/src/index.ts';
import type { CanonicalResumeDocument, TailoringReview, ValidationReport } from '../../../packages/resume-tailor/src/index.ts';
import { ArtifactStore } from '../../../packages/artifact-store/src/index.ts';
import { renderTailoredResume } from '../../../packages/resume-renderer/src/index.ts';
import { openLocalWorkerPayload } from '../../orchestrator/src/wuzzuf-tool-service.ts';
import type { Store } from '../../orchestrator/src/store.ts';
import { WorkerError, type WorkerJobContext, type WorkerJobHandler } from './worker-runtime.ts';

interface ResumeRenderRequest {
  action: 'renderResume';
  input: { document: CanonicalResumeDocument; review: TailoringReview; validation: ValidationReport };
}
export interface ResumeRenderResult { artifacts: { json: Artifact; html: Artifact; pdf: Artifact; diff: Artifact; validation: Artifact } }

export function createResumeRenderHandler(store: Store, workerToken: string, dataDir: string): WorkerJobHandler {
  return async (job: QueueJob, context: WorkerJobContext): Promise<ResumeRenderResult> => {
    let request: ResumeRenderRequest;
    try { request = openLocalWorkerPayload<ResumeRenderRequest>(job.payload, workerToken); }
    catch { throw new WorkerError('WORKER_AUTHENTICATION_FAILED', false, 'Resume render request authentication failed'); }
    if (request?.action !== 'renderResume' || !request.input?.document || !request.input.review || !request.input.validation) throw new WorkerError('INVALID_WORKER_REQUEST', false, 'Invalid resume render request');
    context.signal.throwIfAborted(); context.progress(10, 'validating verified-fact resume');
    const rendered = await renderTailoredResume({ ...request.input, artifacts: new ArtifactStore(resolve(dataDir, 'vault')) });
    context.signal.throwIfAborted(); context.progress(90, 'persisting private artifact metadata');
    const artifacts = { json: rendered.json, html: rendered.html, pdf: rendered.pdf, diff: rendered.diff, validation: rendered.validation };
    for (const artifact of Object.values(artifacts)) store.saveArtifact(artifact);
    return { artifacts };
  };
}

