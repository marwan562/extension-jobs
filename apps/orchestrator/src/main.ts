import { resolve } from 'node:path';
import { FixtureJobSource, ComposioLinkedInSource } from '../../../packages/site-adapters/src/index.ts';
import { DevelopmentProvider, OpenClawGatewayProvider } from '../../../packages/provider-sdk/src/index.ts';
import { Store } from './store.ts';
import { OrchestratorService } from './service.ts';
import { createBridge } from './server.ts';

const env = process.env; const port = Number(env.PORT ?? 18790);
const source = env.JOB_SOURCE_MODE === 'composio' ? new ComposioLinkedInSource(env.COMPOSIO_LINKEDIN_SEARCH_TOOL ?? '', JSON.parse(env.COMPOSIO_LINKEDIN_SEARCH_ARGS ?? '{}') as Record<string, unknown>) : new FixtureJobSource();
const provider = env.OPENCLAW_MODE === 'development' ? new DevelopmentProvider() : new OpenClawGatewayProvider({ agentId: env.OPENCLAW_AGENT_ID ?? 'main', sessionKey: env.OPENCLAW_SESSION_KEY ?? 'agent:main:extension-job-copilot', timeoutSeconds: Number(env.OPENCLAW_TIMEOUT_SECONDS ?? 120) });
const store = new Store(resolve(env.DATA_DIR ?? './data', 'jobs.sqlite'));
const service = new OrchestratorService(store, source, provider);
const extensionId = env.EXTENSION_ID; const devOrigin = env.DEV_ORIGIN;
if (!extensionId && !devOrigin) throw new Error('Set EXTENSION_ID or a loopback DEV_ORIGIN');
const allowedOrigin = extensionId ? `chrome-extension://${extensionId}` : devOrigin!;
const pairingCode = env.PAIRING_CODE ?? crypto.randomUUID();
if (!env.PAIRING_CODE) process.stderr.write(`One-time pairing code: ${pairingCode}\n`);
createBridge(service, { allowedOrigin, pairingCode, sessionTtlMs: Number(env.SESSION_TTL_SECONDS ?? 900) * 1000, ...(env.OPENCLAW_JOB_TOOL_TOKEN ? { toolToken: env.OPENCLAW_JOB_TOOL_TOKEN } : {}) }).listen(port, '127.0.0.1', () => process.stdout.write(`Orchestrator listening on http://127.0.0.1:${port}\n`));
