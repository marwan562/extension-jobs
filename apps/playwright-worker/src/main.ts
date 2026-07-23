import { resolve } from 'node:path';
import { Store } from '../../orchestrator/src/store.ts';
import { OrchestratorService } from '../../orchestrator/src/service.ts';
import { loadOrchestratorConfig } from '../../orchestrator/src/config.ts';
import type { QueueJobType } from '../../../packages/shared-contracts/src/index.ts';
import { WuzzufAdapter } from '../../../packages/site-adapters/src/index.ts';
import { DevelopmentProvider, OpenClawGatewayProvider } from '../../../packages/provider-sdk/src/index.ts';
import { BrowserWorkerRuntime, WorkerError, type WorkerJobHandler } from './worker-runtime.ts';
import { createWuzzufWorkerHandlers } from './wuzzuf-worker-handler.ts';
import { startMockSite } from './mock-server.ts';
import { createResumeRenderHandler } from './resume-render-handler.ts';
import { createDirectJobSource } from '../../orchestrator/src/job-source-factory.ts';
import { createGenericSearchHandler } from './generic-search-handler.ts';

if (process.env.MOCK_SITE_PORT) {
  const port = Number(process.env.MOCK_SITE_PORT); await startMockSite(port);
  process.stdout.write(`Mock job site listening on http://127.0.0.1:${port}\n`);
} else {
  const config = loadOrchestratorConfig(process.env); const workerToken = config.WORKER_TOOL_TOKEN ?? 'development-only-worker-token-v1';
  const store = new Store(resolve(config.DATA_DIR, 'jobs.sqlite'));
  const adapter = new WuzzufAdapter({ cdpEndpoint: config.CHROME_CDP_ENDPOINT, navigationTimeoutMs: config.WUZZUF_NAVIGATION_TIMEOUT_MS });
  const source = createDirectJobSource(config, adapter);
  const provider = config.OPENCLAW_MODE === 'development' ? new DevelopmentProvider() : new OpenClawGatewayProvider({ agentId: config.OPENCLAW_AGENT_ID, sessionKey: config.OPENCLAW_SESSION_KEY, timeoutSeconds: config.OPENCLAW_TIMEOUT_SECONDS });
  const service = new OrchestratorService(store, source, provider, adapter, { wuzzufExecutionMode: 'direct', workerToken });
  const unsupported: WorkerJobHandler = async (job) => { throw new WorkerError('AUTOMATION_NOT_PERMITTED', false, `No enabled adapter handler for ${job.type}`); };
  const handlers = new Map<QueueJobType, WorkerJobHandler>([
    ['application.cleanup', async () => ({ cleaned: true })],
    ['connector.verify-auth', unsupported], ['jobs.search', createGenericSearchHandler(source, workerToken)], ['jobs.read-details', unsupported],
    ['application.inspect', unsupported], ['application.fill', unsupported], ['application.validate', unsupported],
    ['application.submit', unsupported], ['resume.render', createResumeRenderHandler(store, workerToken, config.DATA_DIR)], ['campaign.execute', unsupported]
  ]);
  for (const [type, handler] of createWuzzufWorkerHandlers(service, workerToken)) handlers.set(type, handler);
  const runtime = new BrowserWorkerRuntime(store.queue, { workerId: `browser-worker:${process.pid}`, handlers });
  runtime.start(); process.stdout.write('Browser worker started\n');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await runtime.stop(); await service.wuzzuf.close(); store.close(); process.exit(0); });
}
