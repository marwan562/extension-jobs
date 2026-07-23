import { resolve } from 'node:path';
import { WuzzufAdapter } from '../../../packages/site-adapters/src/index.ts';
import { DevelopmentProvider, OpenAiCompatibleProvider, OpenClawGatewayProvider } from '../../../packages/provider-sdk/src/index.ts';
import { Store } from './store.ts';
import { OrchestratorService } from './service.ts';
import { createBridge } from './server.ts';
import { loadOrchestratorConfig } from './config.ts';
import { CampaignScheduler } from './scheduler.ts';
import { createDirectJobSource } from './job-source-factory.ts';
import { LocalWorkerClient } from './worker-client.ts';
import { WorkerJobSource } from './worker-job-source.ts';

const config = loadOrchestratorConfig(process.env);
const wuzzufAdapter = new WuzzufAdapter({ cdpEndpoint: config.CHROME_CDP_ENDPOINT, navigationTimeoutMs: config.WUZZUF_NAVIGATION_TIMEOUT_MS });
const provider = config.OPENCLAW_MODE === 'development'
  ? new DevelopmentProvider()
  : (config.OPENCLAW_MODE === 'openai' || config.OPENCLAW_BASE_URL)
    ? new OpenAiCompatibleProvider({
        id: 'openclaw-remote',
        baseUrl: config.OPENCLAW_BASE_URL ?? 'http://127.0.0.1:20128/v1',
        ...(config.OPENCLAW_API_KEY ? { apiKey: config.OPENCLAW_API_KEY } : {}),
        defaultModel: config.OPENCLAW_MODEL ?? 'default',
        timeoutMs: config.OPENCLAW_TIMEOUT_SECONDS * 1000
      })
    : new OpenClawGatewayProvider({
        agentId: config.OPENCLAW_AGENT_ID,
        sessionKey: config.OPENCLAW_SESSION_KEY,
        timeoutSeconds: config.OPENCLAW_TIMEOUT_SECONDS
      });
const store = new Store(resolve(config.DATA_DIR, 'jobs.sqlite'));
const workerToken = config.WORKER_TOOL_TOKEN ?? 'development-only-worker-token-v1';
const source = config.JOB_SOURCE_MODE === 'development' ? createDirectJobSource(config, wuzzufAdapter) : new WorkerJobSource(new LocalWorkerClient(store, workerToken));
const service = new OrchestratorService(store, source, provider, wuzzufAdapter, { wuzzufExecutionMode: 'coordinator', workerToken });
const allowedOrigin = [
  ...(config.EXTENSION_ID ? [`chrome-extension://${config.EXTENSION_ID}`] : []),
  ...(config.DEV_ORIGIN ? [config.DEV_ORIGIN] : ['http://127.0.0.1:5173', 'http://localhost:5173'])
];
const pairingCode = config.PAIRING_CODE ?? crypto.randomUUID();
const composioToolToken = config.COMPOSIO_JOBS_TOOL_TOKEN ?? config.COMPOSIO_WUZZUF_TOOL_TOKEN;
if (!config.PAIRING_CODE) process.stderr.write(`One-time pairing code: ${pairingCode}\n`);
const server = createBridge(service, { allowedOrigin, pairingCode, sessionTtlMs: config.SESSION_TTL_SECONDS * 1000, workerToken, ...(config.OPENCLAW_JOB_TOOL_TOKEN ? { toolToken: config.OPENCLAW_JOB_TOOL_TOKEN } : {}), ...(composioToolToken ? { composioToolToken } : {}), ...(config.OPENCLAW_JOB_TOOL_SCOPES ? { openclawScopes: config.OPENCLAW_JOB_TOOL_SCOPES } : {}), ...(config.COMPOSIO_WUZZUF_TOOL_SCOPES ? { composioScopes: config.COMPOSIO_WUZZUF_TOOL_SCOPES } : {}) });
server.listen(config.PORT, '127.0.0.1', () => process.stdout.write(`Orchestrator listening on http://127.0.0.1:${config.PORT}\n`));
const scheduler = new CampaignScheduler(service); scheduler.start();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { scheduler.stop(); server.close(); await service.wuzzuf.close(); store.close(); process.exit(0); });
