import { z } from 'zod';
import { clientScopes } from '../../../packages/shared-contracts/src/index.ts';

const endpoint = z.string().url().refine((value) => ['http:', 'https:', 'ws:', 'wss:'].includes(new URL(value).protocol), 'CHROME_CDP_ENDPOINT must use http, https, ws, or wss');
const scopes = z.string().transform((value, context) => { const parsed = value.split(',').map((item) => item.trim()).filter(Boolean); const unsupported = parsed.filter((item) => !clientScopes.includes(item as typeof clientScopes[number])); if (unsupported.length) { context.addIssue({ code: 'custom', message: `Unsupported scopes: ${unsupported.join(', ')}` }); return z.NEVER; } return parsed as Array<typeof clientScopes[number]>; });

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(18_790),
  EXTENSION_ID: z.string().regex(/^[a-p]{32}$/, 'EXTENSION_ID must be an exact 32-character Chrome extension ID').optional(),
  DEV_ORIGIN: z.string().url().refine((value) => value.startsWith('http://127.0.0.1:'), 'DEV_ORIGIN must be an exact 127.0.0.1 origin').optional(),
  PAIRING_CODE: z.string().min(8).optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  DATA_DIR: z.string().min(1).default('./data'),
  JOB_SOURCE_MODE: z.string().default('development'),
  CHROME_CDP_ENDPOINT: endpoint.default('http://127.0.0.1:9222'),
  WUZZUF_NAVIGATION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
  WUZZUF_USER_ID: z.string().min(1).max(100).default('local-user'),
  OPENCLAW_MODE: z.string().optional(),
  OPENCLAW_AGENT_ID: z.string().default('main'),
  OPENCLAW_SESSION_KEY: z.string().default('agent:main:extension-job-copilot'),
  OPENCLAW_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(600).default(120),
  OPENCLAW_JOB_TOOL_TOKEN: z.string().min(32).optional(),
  COMPOSIO_WUZZUF_TOOL_TOKEN: z.string().min(32).optional(),
  OPENCLAW_JOB_TOOL_SCOPES: scopes.optional(),
  COMPOSIO_WUZZUF_TOOL_SCOPES: scopes.optional(),
  COMPOSIO_LINKEDIN_SEARCH_TOOL: z.string().optional(),
  COMPOSIO_LINKEDIN_SEARCH_ARGS: z.string().default('{}'),
}).superRefine((value, context) => {
  if (!value.EXTENSION_ID && !value.DEV_ORIGIN) context.addIssue({ code: 'custom', message: 'Set EXTENSION_ID or a loopback DEV_ORIGIN' });
  try { JSON.parse(value.COMPOSIO_LINKEDIN_SEARCH_ARGS); } catch { context.addIssue({ code: 'custom', path: ['COMPOSIO_LINKEDIN_SEARCH_ARGS'], message: 'COMPOSIO_LINKEDIN_SEARCH_ARGS must be valid JSON' }); }
});

export type OrchestratorConfig = z.infer<typeof environmentSchema>;

export function loadOrchestratorConfig(environment: NodeJS.ProcessEnv): OrchestratorConfig {
  const result = environmentSchema.safeParse(environment);
  if (result.success) return result.data;
  const detail = result.error.issues.map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`).join('\n');
  throw new Error(`Invalid orchestrator configuration:\n${detail}`);
}
