import { Type } from 'typebox';
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin';

const baseUrl = process.env.OPENCLAW_JOB_BRIDGE_URL || 'http://127.0.0.1:18790';
const toolToken = process.env.OPENCLAW_JOB_TOOL_TOKEN || '';
const jobRef = { jobId: Type.Optional(Type.String({ maxLength: 100 })), url: Type.Optional(Type.String({ maxLength: 2000 })), profileId: Type.Optional(Type.String({ maxLength: 100 })) };
const applicationId = Type.String({ minLength: 1, maxLength: 100 });
const actions = Type.Union([
  Type.Object({ action: Type.Literal('profile_context'), profileId: Type.Optional(Type.String()) }),
  Type.Object({ action: Type.Literal('prepare_answers'), profileId: Type.Optional(Type.String()), questions: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }) }),
  Type.Object({ action: Type.Literal('status') }),
  Type.Object({ action: Type.Literal('run_campaign'), campaignId: Type.String() }),
  Type.Object({ action: Type.Literal('emergency_stop') }),
  Type.Object({ action: Type.Literal('WUZZUF_SEARCH_JOBS'), queries: Type.Array(Type.String(), { minItems: 1, maxItems: 10 }), locations: Type.Array(Type.String(), { minItems: 1, maxItems: 10 }), remote: Type.Optional(Type.Boolean()), experienceLevel: Type.Optional(Type.String()), employmentTypes: Type.Optional(Type.Array(Type.String(), { maxItems: 10 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }),
  Type.Object({ action: Type.Literal('WUZZUF_GET_JOB_DETAILS'), url: Type.String({ maxLength: 2000 }) }),
  Type.Object({ action: Type.Literal('WUZZUF_SCORE_JOB'), ...jobRef }),
  Type.Object({ action: Type.Literal('WUZZUF_PREPARE_APPLICATION'), ...jobRef, dryRun: Type.Optional(Type.Boolean({ default: true })) }),
  Type.Object({ action: Type.Literal('WUZZUF_FILL_APPLICATION'), applicationId, approvedAnswerOverrides: Type.Optional(Type.Array(Type.Object({ fieldId: Type.Optional(Type.String()), label: Type.Optional(Type.String()), value: Type.String({ maxLength: 5000 }), approved: Type.Literal(true) }), { maxItems: 100 })), dryRun: Type.Optional(Type.Boolean({ default: true })) }),
  Type.Object({ action: Type.Literal('WUZZUF_GET_APPLICATION_REVIEW'), applicationId }),
  Type.Object({ action: Type.Literal('WUZZUF_SUBMIT_APPLICATION'), applicationId, approvalToken: Type.String({ minLength: 20, maxLength: 200 }) }),
  Type.Object({ action: Type.Literal('WUZZUF_GET_APPLICATION_STATUS'), applicationId }),
  Type.Object({ action: Type.Literal('WUZZUF_CANCEL_APPLICATION'), applicationId }),
  Type.Object({ action: Type.Literal('WUZZUF_GET_AUTH_STATUS') }),
  Type.Object({ action: Type.Literal('WUZZUF_OPEN_LOGIN') }),
]);

export default defineToolPlugin({
  id: 'job-automation', name: 'Job Automation', description: 'Resume-grounded job search and review-first application control through the authenticated local orchestrator.',
  tools: (tool) => [tool({
    name: 'job_automation',
    description: 'Search and score Wuzzuf jobs, prepare and fill applications, inspect reviews and status, request local approval, submit only with a short-lived approval token, cancel runs, or engage the emergency stop. Wuzzuf operations never expose browser internals, files, or credentials.',
    parameters: actions,
    execute: async (params) => {
      if (!toolToken) return structuredError('OPENCLAW_TOOL_TOKEN_REQUIRED', 'OPENCLAW_JOB_TOOL_TOKEN is not configured');
      if (params.action.startsWith('WUZZUF_')) { const { action, ...input } = params; return request(`/v1/wuzzuf/tools/${action}`, 'POST', input); }
      if (params.action === 'profile_context') { const data = await request('/v1/dashboard'); if (data.error) return data; const profile = params.profileId ? data.profiles.find((p) => p.id === params.profileId) : data.profiles.find((p) => p.id === data.agentSettings.activeProfileId) || data.profiles[0]; return { profile: profile ? { id: profile.id, name: profile.name, facts: profile.facts.filter((f) => f.path !== 'source.rawText') } : null }; }
      if (params.action === 'prepare_answers') return request('/v1/answers/prepare', 'POST', { labels: params.questions, profileId: params.profileId });
      if (params.action === 'run_campaign') return request(`/v1/campaigns/${encodeURIComponent(params.campaignId)}/run`, 'POST');
      if (params.action === 'emergency_stop') return request('/v1/emergency-stop', 'POST');
      const data = await request('/v1/dashboard'); return data.error ? data : { emergencyStop: data.emergencyStop, campaigns: data.campaigns, recentEvents: data.timeline.slice(0, 20) };
    }
  })]
});

async function request(path, method = 'GET', body) {
  try { const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'x-openclaw-tool-token': toolToken, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000), redirect: 'error' }); const data = await response.json(); if (!response.ok) return data?.error ? { ok: false, error: data.error } : structuredError('ORCHESTRATOR_REQUEST_FAILED', `Job bridge returned ${response.status}`, response.status >= 500); return data; }
  catch (error) { return structuredError('ORCHESTRATOR_UNAVAILABLE', error instanceof Error ? error.message : 'Orchestrator request failed', true); }
}
function structuredError(code, message, retryable = false) { return { ok: false, error: { code, message, retryable } }; }
