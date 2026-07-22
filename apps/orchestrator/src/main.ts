import { resolve } from 'node:path';
import { FixtureJobSource, ComposioLinkedInSource, WuzzufAdapter, WuzzufJobSource, IndeedJobSource, MultiJobSource, type JobSource } from '../../../packages/site-adapters/src/index.ts';
import { DevelopmentProvider, OpenClawGatewayProvider } from '../../../packages/provider-sdk/src/index.ts';
import { Store } from './store.ts';
import { OrchestratorService } from './service.ts';
import { createBridge } from './server.ts';
import { loadOrchestratorConfig } from './config.ts';
import { CampaignScheduler } from './scheduler.ts';

const config = loadOrchestratorConfig(process.env);
const wuzzufAdapter = new WuzzufAdapter({ cdpEndpoint: config.CHROME_CDP_ENDPOINT, navigationTimeoutMs: config.WUZZUF_NAVIGATION_TIMEOUT_MS });
const sources: JobSource[] = [];
if (config.JOB_SOURCE_MODE === 'development') {
  sources.push(new FixtureJobSource());
} else {
  const modes = config.JOB_SOURCE_MODE.split(',');
  if (modes.includes('fixture')) sources.push(new FixtureJobSource());
  if (modes.includes('wuzzuf') || modes.includes('multi')) sources.push(new WuzzufJobSource(wuzzufAdapter));
  if (modes.includes('indeed') || modes.includes('multi')) sources.push(new IndeedJobSource());
  if (modes.includes('composio') || modes.includes('multi')) {
    if (config.COMPOSIO_LINKEDIN_SEARCH_TOOL) {
      sources.push(new ComposioLinkedInSource(config.COMPOSIO_LINKEDIN_SEARCH_TOOL, JSON.parse(config.COMPOSIO_LINKEDIN_SEARCH_ARGS) as Record<string, unknown>));
    }
  }
}
if (sources.length === 0) throw new Error(`JOB_SOURCE_MODE ${config.JOB_SOURCE_MODE} did not configure any job source`);
const source = sources.length === 1 ? sources[0]! : new MultiJobSource(sources);

const provider = config.OPENCLAW_MODE === 'development' ? new DevelopmentProvider() : new OpenClawGatewayProvider({ agentId: config.OPENCLAW_AGENT_ID, sessionKey: config.OPENCLAW_SESSION_KEY, timeoutSeconds: config.OPENCLAW_TIMEOUT_SECONDS });
const store = new Store(resolve(config.DATA_DIR, 'jobs.sqlite'));
const service = new OrchestratorService(store, source, provider, wuzzufAdapter);
const allowedOrigin = config.EXTENSION_ID ? `chrome-extension://${config.EXTENSION_ID}` : config.DEV_ORIGIN!;
const pairingCode = config.PAIRING_CODE ?? crypto.randomUUID();
if (!config.PAIRING_CODE) process.stderr.write(`One-time pairing code: ${pairingCode}\n`);
const server = createBridge(service, { allowedOrigin, pairingCode, sessionTtlMs: config.SESSION_TTL_SECONDS * 1000, ...(config.OPENCLAW_JOB_TOOL_TOKEN ? { toolToken: config.OPENCLAW_JOB_TOOL_TOKEN } : {}), ...(config.COMPOSIO_WUZZUF_TOOL_TOKEN ? { composioToolToken: config.COMPOSIO_WUZZUF_TOOL_TOKEN } : {}), ...(config.OPENCLAW_JOB_TOOL_SCOPES ? { openclawScopes: config.OPENCLAW_JOB_TOOL_SCOPES } : {}), ...(config.COMPOSIO_WUZZUF_TOOL_SCOPES ? { composioScopes: config.COMPOSIO_WUZZUF_TOOL_SCOPES } : {}) });
server.listen(config.PORT, '127.0.0.1', () => process.stdout.write(`Orchestrator listening on http://127.0.0.1:${config.PORT}\n`));
const scheduler = new CampaignScheduler(service); scheduler.start();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { scheduler.stop(); server.close(); await service.wuzzuf.close(); store.close(); process.exit(0); });
