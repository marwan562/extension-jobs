import { Type } from 'typebox';
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin';

const baseUrl = process.env.OPENCLAW_JOB_BRIDGE_URL || 'http://127.0.0.1:18790';
const toolToken = process.env.OPENCLAW_JOB_TOOL_TOKEN || '';

export default defineToolPlugin({
  id: 'job-automation', name: 'Job Automation', description: 'Resume-grounded job application control through the local OpenClaw orchestrator.',
  tools: (tool) => [tool({
    name: 'job_automation',
    description: 'Read the verified candidate profile, prepare professional application answers, inspect status, run an existing campaign, or engage the emergency stop. Never use unsupported facts and request approval for sensitive answers.',
    parameters: Type.Object({ action: Type.Union([Type.Literal('profile_context'), Type.Literal('prepare_answers'), Type.Literal('status'), Type.Literal('run_campaign'), Type.Literal('emergency_stop')]), profileId: Type.Optional(Type.String()), questions: Type.Optional(Type.Array(Type.String(), { maxItems: 100 })), campaignId: Type.Optional(Type.String()) }),
    execute: async (params) => {
      if (!toolToken) return { error: 'OPENCLAW_JOB_TOOL_TOKEN is not configured' };
      if (params.action === 'profile_context') { const data = await request('/v1/dashboard'); const profile = params.profileId ? data.profiles.find((p) => p.id === params.profileId) : data.profiles.find((p) => p.id === data.agentSettings.activeProfileId) || data.profiles[0]; return { profile: profile ? { id: profile.id, name: profile.name, facts: profile.facts.filter((f) => f.path !== 'source.rawText') } : null }; }
      if (params.action === 'prepare_answers') { if (!params.questions?.length) return { error: 'questions are required' }; return request('/v1/answers/prepare', 'POST', { labels: params.questions, profileId: params.profileId }); }
      if (params.action === 'run_campaign') { if (!params.campaignId) return { error: 'campaignId is required' }; return request(`/v1/campaigns/${encodeURIComponent(params.campaignId)}/run`, 'POST'); }
      if (params.action === 'emergency_stop') return request('/v1/emergency-stop', 'POST');
      const data = await request('/v1/dashboard'); return { emergencyStop: data.emergencyStop, campaigns: data.campaigns, recentEvents: data.timeline.slice(0, 20) };
    }
  })]
});
async function request(path, method = 'GET', body) { const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'x-openclaw-tool-token': toolToken, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || `Job bridge returned ${response.status}`); return data; }
