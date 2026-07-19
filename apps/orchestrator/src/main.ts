import { resolve } from 'node:path';
import { FixtureJobSource, ComposioLinkedInSource, WuzzufAdapter, WuzzufJobSource, IndeedJobSource, MultiJobSource, type JobSource } from '../../../packages/site-adapters/src/index.ts';
import { DevelopmentProvider, OpenClawGatewayProvider } from '../../../packages/provider-sdk/src/index.ts';
import { Store } from './store.ts';
import { OrchestratorService } from './service.ts';
import { createBridge } from './server.ts';

const env = process.env; const port = Number(env.PORT ?? 18790);
const wuzzufAdapter = new WuzzufAdapter();
const sources: JobSource[] = [];
if (env.JOB_SOURCE_MODE === 'development' || !env.JOB_SOURCE_MODE) {
  sources.push(new FixtureJobSource());
} else {
  const modes = env.JOB_SOURCE_MODE.split(',');
  if (modes.includes('fixture')) sources.push(new FixtureJobSource());
  if (modes.includes('wuzzuf') || modes.includes('multi')) sources.push(new WuzzufJobSource(wuzzufAdapter));
  if (modes.includes('indeed') || modes.includes('multi')) sources.push(new IndeedJobSource());
  if (modes.includes('composio') || modes.includes('multi')) {
    if (env.COMPOSIO_LINKEDIN_SEARCH_TOOL) {
      sources.push(new ComposioLinkedInSource(env.COMPOSIO_LINKEDIN_SEARCH_TOOL, JSON.parse(env.COMPOSIO_LINKEDIN_SEARCH_ARGS ?? '{}') as Record<string, unknown>));
    }
  }
}
const source = sources.length === 1 ? sources[0]! : (sources.length === 0 ? new FixtureJobSource() : new MultiJobSource(sources));

const provider = env.OPENCLAW_MODE === 'development' ? new DevelopmentProvider() : new OpenClawGatewayProvider({ agentId: env.OPENCLAW_AGENT_ID ?? 'main', sessionKey: env.OPENCLAW_SESSION_KEY ?? 'agent:main:extension-job-copilot', timeoutSeconds: Number(env.OPENCLAW_TIMEOUT_SECONDS ?? 120) });
const store = new Store(resolve(env.DATA_DIR ?? './data', 'jobs.sqlite'));
const service = new OrchestratorService(store, source, provider, wuzzufAdapter);
const extensionId = env.EXTENSION_ID; const devOrigin = env.DEV_ORIGIN;
if (!extensionId && !devOrigin) throw new Error('Set EXTENSION_ID or a loopback DEV_ORIGIN');
const allowedOrigin = extensionId ? `chrome-extension://${extensionId}` : devOrigin!;
const pairingCode = env.PAIRING_CODE ?? crypto.randomUUID();
if (!env.PAIRING_CODE) process.stderr.write(`One-time pairing code: ${pairingCode}\n`);
const server = createBridge(service, { allowedOrigin, pairingCode, sessionTtlMs: Number(env.SESSION_TTL_SECONDS ?? 900) * 1000, ...(env.OPENCLAW_JOB_TOOL_TOKEN ? { toolToken: env.OPENCLAW_JOB_TOOL_TOKEN } : {}) });
server.listen(port, '127.0.0.1', () => process.stdout.write(`Orchestrator listening on http://127.0.0.1:${port}\n`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { server.close(); await service.wuzzuf.close(); store.close(); process.exit(0); });
