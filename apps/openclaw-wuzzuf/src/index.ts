import { Type } from 'typebox';
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin';
import { request, type PluginConfig } from './client.ts';

const applicationId = Type.String({ minLength: 1, maxLength: 100 });
const idempotencyKey = Type.Optional(Type.String({ minLength: 1, maxLength: 128 }));
const jobRef = { jobId: Type.Optional(Type.String({ maxLength: 100 })), url: Type.Optional(Type.String({ maxLength: 2000 })), profileId: Type.Optional(Type.String({ maxLength: 100 })) };
const empty = Type.Object({}, { additionalProperties: false });
const configSchema = Type.Object({ bridgeUrl: Type.Optional(Type.String({ default: 'http://127.0.0.1:18790' })), toolToken: Type.String({ minLength: 32, description: 'Authentication token shared with the local orchestrator' }), timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 300000, default: 60000 })) }, { additionalProperties: false });

type ToolFactory = any;
const remote = (tool: ToolFactory, name: string, description: string, action: string, parameters: unknown) => tool({ name, description, parameters, execute: (params: Record<string, unknown>, config: PluginConfig) => request(config, `/v1/wuzzuf/tools/${action}`, 'POST', params) });

export const runtimeRegisteredToolNames = [
  'wuzzuf_create_connection', 'wuzzuf_open_login', 'wuzzuf_get_auth_status', 'wuzzuf_verify_connection', 'wuzzuf_disconnect',
  'wuzzuf_search_jobs', 'wuzzuf_get_job_details', 'wuzzuf_score_job', 'wuzzuf_prepare_application', 'wuzzuf_fill_application',
  'wuzzuf_get_application_review', 'wuzzuf_request_submission_approval', 'wuzzuf_submit_application', 'wuzzuf_get_application_status', 'wuzzuf_cancel_application',
  'job_profile_context', 'job_prepare_answers', 'job_get_status', 'job_run_campaign', 'job_emergency_stop'
] as const;

export default defineToolPlugin({
  id: 'job-automation', name: 'Job Automation', description: 'Local resume-grounded job tools with review-first Wuzzuf application control.', configSchema,
  tools: (tool: ToolFactory) => [
    remote(tool, 'wuzzuf_create_connection', 'Open Wuzzuf login in the existing Chrome profile and verify the local connection.', 'WUZZUF_CREATE_CONNECTION', empty),
    remote(tool, 'wuzzuf_open_login', 'Open or reuse the application-managed Wuzzuf login tab in existing Chrome.', 'WUZZUF_OPEN_LOGIN', empty),
    remote(tool, 'wuzzuf_get_auth_status', 'Read cached local Wuzzuf connection state without exposing browser data.', 'WUZZUF_GET_AUTH_STATUS', empty),
    remote(tool, 'wuzzuf_verify_connection', 'Verify current Wuzzuf authentication and security-check state.', 'WUZZUF_VERIFY_CONNECTION', empty),
    remote(tool, 'wuzzuf_disconnect', 'Logically disconnect Wuzzuf automation without closing personal Chrome.', 'WUZZUF_DISCONNECT', empty),
    remote(tool, 'wuzzuf_search_jobs', 'Search Wuzzuf and return normalized jobs.', 'WUZZUF_SEARCH_JOBS', Type.Object({ queries: Type.Array(Type.String(), { minItems: 1, maxItems: 10 }), locations: Type.Array(Type.String(), { minItems: 1, maxItems: 10 }), remote: Type.Optional(Type.Boolean()), experienceLevel: Type.Optional(Type.String()), employmentTypes: Type.Optional(Type.Array(Type.String(), { maxItems: 10 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) })),
    remote(tool, 'wuzzuf_get_job_details', 'Read normalized details for a Wuzzuf job URL.', 'WUZZUF_GET_JOB_DETAILS', Type.Object({ url: Type.String({ maxLength: 2000 }) })),
    remote(tool, 'wuzzuf_score_job', 'Score a Wuzzuf job against the verified local candidate profile.', 'WUZZUF_SCORE_JOB', Type.Object(jobRef)),
    remote(tool, 'wuzzuf_prepare_application', 'Prepare an application for review without submitting it.', 'WUZZUF_PREPARE_APPLICATION', Type.Object({ ...jobRef, dryRun: Type.Optional(Type.Boolean({ default: true })), idempotencyKey })),
    remote(tool, 'wuzzuf_fill_application', 'Fill approved non-sensitive fields and stop before submission.', 'WUZZUF_FILL_APPLICATION', Type.Object({ applicationId, approvedAnswerOverrides: Type.Optional(Type.Array(Type.Object({ fieldId: Type.Optional(Type.String()), label: Type.Optional(Type.String()), value: Type.String({ maxLength: 5000 }), approved: Type.Literal(true) }), { maxItems: 100 })), dryRun: Type.Optional(Type.Boolean({ default: true })), idempotencyKey })),
    remote(tool, 'wuzzuf_get_application_review', 'Read the final application review and blockers.', 'WUZZUF_GET_APPLICATION_REVIEW', Type.Object({ applicationId })),
    remote(tool, 'wuzzuf_request_submission_approval', 'Request human approval in the paired extension. This does not approve or submit.', 'WUZZUF_REQUEST_SUBMISSION_APPROVAL', Type.Object({ applicationId, ttlSeconds: Type.Optional(Type.Integer({ minimum: 30, maximum: 300 })), idempotencyKey })),
    remote(tool, 'wuzzuf_submit_application', 'Submit exactly once using an approval request already confirmed by the human in the extension.', 'WUZZUF_SUBMIT_APPLICATION', Type.Object({ applicationId, approvalRequestId: Type.String({ minLength: 1, maxLength: 100 }), idempotencyKey })),
    remote(tool, 'wuzzuf_get_application_status', 'Read application state, progress and normalized errors.', 'WUZZUF_GET_APPLICATION_STATUS', Type.Object({ applicationId })),
    remote(tool, 'wuzzuf_cancel_application', 'Cancel an active application without affecting unrelated browser tabs.', 'WUZZUF_CANCEL_APPLICATION', Type.Object({ applicationId, idempotencyKey })),
    tool({ name: 'job_profile_context', description: 'Read the safe verified profile context.', parameters: Type.Object({ profileId: Type.Optional(Type.String()) }), execute: async (params: Record<string, unknown>, config: PluginConfig) => { const data = await request(config, '/v1/dashboard') as any; if (data?.error) return data; const profile = params.profileId ? data.profiles.find((item: any) => item.id === params.profileId) : data.profiles.find((item: any) => item.id === data.agentSettings.activeProfileId) ?? data.profiles[0]; return { profile: profile ? { id: profile.id, name: profile.name, facts: profile.facts.filter((fact: any) => fact.path !== 'source.rawText') } : null }; } }),
    tool({ name: 'job_prepare_answers', description: 'Prepare resume-grounded answers for named questions.', parameters: Type.Object({ profileId: Type.Optional(Type.String()), questions: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }) }), execute: (params: Record<string, unknown>, config: PluginConfig) => request(config, '/v1/answers/prepare', 'POST', { labels: params.questions, ...(params.profileId ? { profileId: params.profileId } : {}) }) }),
    tool({ name: 'job_get_status', description: 'Read campaign, emergency-stop, and recent audit status.', parameters: empty, execute: async (_params: Record<string, unknown>, config: PluginConfig) => { const data = await request(config, '/v1/dashboard') as any; return data?.error ? data : { emergencyStop: data.emergencyStop, campaigns: data.campaigns, recentEvents: data.timeline.slice(0, 20) }; } }),
    tool({ name: 'job_run_campaign', description: 'Run one configured local job campaign.', parameters: Type.Object({ campaignId: Type.String() }), execute: (params: Record<string, unknown>, config: PluginConfig) => request(config, `/v1/campaigns/${encodeURIComponent(String(params.campaignId))}/run`, 'POST') }),
    tool({ name: 'job_emergency_stop', description: 'Immediately stop active local job automation.', parameters: empty, execute: (_params: Record<string, unknown>, config: PluginConfig) => request(config, '/v1/emergency-stop', 'POST') })
  ]
});
