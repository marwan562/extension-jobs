import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { importCvText, updateProfileFact } from '../../../packages/profile-engine/src/index.ts';
import { parseFriendlySchedule, ValidationError, asRecord, requiredString, stringArray, validateTimezone } from '../../../packages/shared/src/validation.ts';
import type { AgentSettings, ExecutionMode, JobCampaign } from '../../../packages/shared/src/domain.ts';
import { WuzzufToolError, wuzzufToolActions, type WuzzufToolAction } from '../../../packages/shared/src/wuzzuf.ts';
import { OrchestratorService } from './service.ts';

const MAX_BODY_BYTES = 6 * 1024 * 1024;

class Sessions {
  private readonly tokens = new Map<string, number>();
  private readonly pairingCode: string; private readonly ttlMs: number;
  constructor(pairingCode: string, ttlMs: number) { this.pairingCode = pairingCode; this.ttlMs = ttlMs; }
  pair(code: string): { token: string; expiresAt: string } {
    const expected = createHash('sha256').update(this.pairingCode).digest(); const actual = createHash('sha256').update(code).digest();
    if (!timingSafeEqual(expected, actual)) throw new HttpError(401, 'Invalid pairing code');
    const token = randomBytes(32).toString('base64url'); const expires = Date.now() + this.ttlMs; this.tokens.set(createHash('sha256').update(token).digest('hex'), expires);
    return { token, expiresAt: new Date(expires).toISOString() };
  }
  valid(token: string): boolean { const key = createHash('sha256').update(token).digest('hex'); const expires = this.tokens.get(key); if (!expires || expires < Date.now()) { this.tokens.delete(key); return false; } return true; }
}

class HttpError extends Error { readonly status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

export interface BridgeOptions { allowedOrigin: string; pairingCode: string; sessionTtlMs?: number; toolToken?: string }

export function createBridge(service: OrchestratorService, options: BridgeOptions) {
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(options.allowedOrigin) && !options.allowedOrigin.startsWith('http://127.0.0.1:')) throw new Error('An exact extension or loopback development origin is required');
  const sessions = new Sessions(options.pairingCode, options.sessionTtlMs ?? 15 * 60_000);
  const limiter = new RateLimiter(120, 60_000);
  const server = createServer(async (req, res) => {
    try {
      if (!limiter.allow(req.socket.remoteAddress ?? 'loopback')) throw new HttpError(429, 'Rate limit exceeded');
      applySecurityHeaders(req, res, options.allowedOrigin);
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, emergencyStop: service.emergencyStop.active });
      if (req.method === 'POST' && url.pathname === '/v1/pair') { const body = asRecord(await readJson(req)); return json(res, 200, sessions.pair(requiredString(body.code, 'code', 256))); }
      authorize(req, sessions, options.toolToken);
      const wuzzufMatch = url.pathname.match(/^\/v1\/wuzzuf\/tools\/([A-Z_]+)$/);
      if (req.method === 'POST' && wuzzufMatch) {
        const action = wuzzufMatch[1] as WuzzufToolAction; if (!wuzzufToolActions.includes(action)) throw new HttpError(404, 'Unknown Wuzzuf action'); const body = asRecord(await readJson(req)); const data = await dispatchWuzzufAction(service, action, body); return json(res, 200, { ok: true, data });
      }
      if (req.method === 'GET' && url.pathname === '/v1/dashboard') return json(res, 200, { campaigns: service.store.listCampaigns(), profiles: service.store.listProfiles(), timeline: service.store.timeline(), agentSettings: service.settings, emergencyStop: service.emergencyStop.active });
      if (req.method === 'POST' && url.pathname === '/v1/profiles/import') {
        const body = asRecord(await readJson(req)); const sourceName = requiredString(body.sourceName, 'sourceName', 200); const text = typeof body.base64 === 'string' ? await extractResumeText(sourceName, body.base64) : requiredString(body.text, 'text', 200_000); const profile = importCvText(requiredString(body.name, 'name', 100), sourceName, text); service.saveProfile(profile); const settings = { ...service.settings, activeProfileId: profile.id, updatedAt: new Date().toISOString() }; service.saveSettings(settings); service.audit(profile.id, 'profile.imported', { sourceName, factCount: profile.facts.length }); return json(res, 201, profile);
      }
      const factMatch = url.pathname.match(/^\/v1\/profiles\/([^/]+)\/facts\/([^/]+)$/);
      if (req.method === 'POST' && factMatch) { const profile = service.store.getProfile(factMatch[1]!); if (!profile) throw new HttpError(404, 'Profile not found'); const body = asRecord(await readJson(req)); const value = body.value; if (!['string', 'number', 'boolean'].includes(typeof value)) throw new ValidationError('Invalid fact value'); const updated = updateProfileFact(profile, factMatch[2]!, value as string | number | boolean); service.saveProfile(updated); service.audit(profile.id, 'profile.fact_updated', { factId: factMatch[2] }); return json(res, 200, updated); }
      if (req.method === 'POST' && url.pathname === '/v1/campaigns') {
        const body = asRecord(await readJson(req)); const now = new Date().toISOString(); const timezone = validateTimezone(requiredString(body.timezone ?? 'Africa/Cairo', 'timezone', 100));
        const mode = requiredString(body.executionMode ?? 'prepare_and_review', 'executionMode', 40) as ExecutionMode; if (!['research_only', 'prepare_and_review', 'auto_submit'].includes(mode)) throw new ValidationError('Invalid execution mode');
        const scheduleText = typeof body.schedule === 'string' && body.schedule.trim() ? body.schedule : undefined;
        const campaign: JobCampaign = {
          id: randomUUID(), name: requiredString(body.name, 'name', 100), state: 'enabled', searchQueries: stringArray(body.searchQueries, 'searchQueries'), locations: stringArray(body.locations, 'locations'),
          workplace: ['remote'], includedKeywords: stringArray(body.includedKeywords ?? [], 'includedKeywords'), excludedKeywords: stringArray(body.excludedKeywords ?? [], 'excludedKeywords'), seniority: stringArray(body.seniority ?? ['senior'], 'seniority'),
          minimumMatchScore: boundedNumber(body.minimumMatchScore, 'minimumMatchScore', 0, 100, 70), allowedSites: stringArray(body.allowedSites ?? ['development'], 'allowedSites'), maxApplicationsPerRun: boundedNumber(body.maxApplicationsPerRun, 'maxApplicationsPerRun', 1, 100, 10), maxApplicationsPerDay: boundedNumber(body.maxApplicationsPerDay, 'maxApplicationsPerDay', 1, 200, 20),
          ...(scheduleText ? { schedule: parseFriendlySchedule(scheduleText, timezone) } : {}), executionMode: mode, profileId: requiredString(body.profileId, 'profileId', 100), cvStrategy: requiredString(body.cvStrategy ?? 'selected', 'cvStrategy', 100), providerId: requiredString(body.providerId ?? 'openclaw', 'providerId', 100), model: requiredString(body.model ?? 'default', 'model', 200), dryRun: body.dryRun !== false, createdAt: now, updatedAt: now
        };
        return json(res, 201, service.createCampaign(campaign));
      }
      const runMatch = url.pathname.match(/^\/v1\/campaigns\/([^/]+)\/run$/);
      if (req.method === 'POST' && runMatch) { const campaign = service.store.getCampaign(runMatch[1]!); if (!campaign) throw new HttpError(404, 'Campaign not found'); if (campaign.state === 'paused') throw new HttpError(409, 'Campaign is paused'); return json(res, 200, await service.runCampaign(campaign)); }
      const stateMatch = url.pathname.match(/^\/v1\/campaigns\/([^/]+)\/(pause|resume)$/);
      if (req.method === 'POST' && stateMatch) { const campaign = service.store.getCampaign(stateMatch[1]!); if (!campaign) throw new HttpError(404, 'Campaign not found'); const updated: JobCampaign = { ...campaign, state: stateMatch[2] === 'pause' ? 'paused' : 'enabled', updatedAt: new Date().toISOString() }; service.store.saveCampaign(updated); service.audit(campaign.id, `campaign.${updated.state}`, {}); return json(res, 200, updated); }
      const fillMatch = url.pathname.match(/^\/v1\/applications\/([^/]+)\/fill-result$/);
      if (req.method === 'POST' && fillMatch) { const body = asRecord(await readJson(req)); const filled = stringArray(body.filled ?? [], 'filled', 100); const skipped = stringArray(body.skipped ?? [], 'skipped', 100); service.audit(requiredString(body.correlationId, 'correlationId', 100), skipped.length ? 'application.fill_partial' : 'application.filled', { filled, skipped }, fillMatch[1]); return json(res, 200, { recorded: true }); }
      if (req.method === 'POST' && url.pathname === '/v1/chat') {
        const body = asRecord(await readJson(req)); const text = requiredString(body.text, 'text', 8_000); const profileId = typeof body.profileId === 'string' ? body.profileId : undefined; res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
        for await (const chunk of service.chat(text, profileId)) res.write(`${JSON.stringify({ type: 'chunk', text: chunk })}\n`); res.end(`${JSON.stringify({ type: 'done' })}\n`); return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/models') return json(res, 200, await service.discoverModels());
      if (req.method === 'POST' && url.pathname === '/v1/agent-settings') { const body = asRecord(await readJson(req)); const current = service.settings; const settings: AgentSettings = { ...current, ...(typeof body.activeProfileId === 'string' ? { activeProfileId: body.activeProfileId } : {}), chatModel: requiredString(body.chatModel ?? current.chatModel, 'chatModel', 200), answerModel: requiredString(body.answerModel ?? current.answerModel, 'answerModel', 200), matchingModel: requiredString(body.matchingModel ?? current.matchingModel, 'matchingModel', 200), temperature: boundedNumber(body.temperature, 'temperature', 0, 2, current.temperature), maximumAnswerLength: boundedNumber(body.maximumAnswerLength, 'maximumAnswerLength', 50, 5000, current.maximumAnswerLength), confidenceThreshold: boundedNumber(body.confidenceThreshold, 'confidenceThreshold', 0, 1, current.confidenceThreshold), maximumConcurrentRuns: boundedNumber(body.maximumConcurrentRuns, 'maximumConcurrentRuns', 1, 10, current.maximumConcurrentRuns), defaultDryRun: body.defaultDryRun !== false, browserHeadless: body.browserHeadless !== false, updatedAt: new Date().toISOString() }; service.saveSettings(settings); return json(res, 200, settings); }
      if (req.method === 'POST' && url.pathname === '/v1/answers/prepare') { const body = asRecord(await readJson(req)); const labels = stringArray(body.labels, 'labels', 100); return json(res, 200, await service.prepareQuestions(labels, typeof body.profileId === 'string' ? body.profileId : undefined)); }
      if (req.method === 'POST' && url.pathname === '/v1/emergency-stop') { service.emergencyStop.engage(); service.audit(randomUUID(), 'emergency_stop.engaged', {}); return json(res, 200, { stopped: true }); }
      if (req.method === 'POST' && url.pathname === '/v1/emergency-stop/reset') { service.emergencyStop.reset(); return json(res, 200, { stopped: false }); }
      throw new HttpError(404, 'Not found');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof WuzzufToolError ? error.status : error instanceof ValidationError || error instanceof SyntaxError ? 400 : 500;
      if (error instanceof WuzzufToolError) return json(res, status, { ok: false, error: { code: error.code, message: error.message, retryable: error.retryable, ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}) } });
      json(res, status, { error: status === 500 ? 'Internal server error' : error instanceof Error ? error.message : 'Request failed' });
    }
  });
  server.requestTimeout = 65_000; server.headersTimeout = 10_000; return server;
}

class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}
  allow(key: string): boolean { const now = Date.now(); const current = this.buckets.get(key); if (!current || current.resetAt <= now) { this.buckets.set(key, { count: 1, resetAt: now + this.windowMs }); return true; } current.count += 1; return current.count <= this.limit; }
}

async function dispatchWuzzufAction(service: OrchestratorService, action: WuzzufToolAction, body: Record<string, unknown>): Promise<unknown> {
  const applicationId = () => requiredString(body.applicationId, 'applicationId', 100); const jobRef = () => ({ ...(typeof body.jobId === 'string' ? { jobId: requiredString(body.jobId, 'jobId', 100) } : {}), ...(typeof body.url === 'string' ? { url: requiredString(body.url, 'url', 2_000) } : {}), ...(typeof body.profileId === 'string' ? { profileId: requiredString(body.profileId, 'profileId', 100) } : {}) });
  switch (action) {
    case 'WUZZUF_SEARCH_JOBS': return service.wuzzuf.search({ queries: stringArray(body.queries, 'queries', 10), locations: stringArray(body.locations, 'locations', 10), ...(typeof body.remote === 'boolean' ? { remote: body.remote } : {}), ...(typeof body.experienceLevel === 'string' ? { experienceLevel: requiredString(body.experienceLevel, 'experienceLevel', 100) } : {}), ...(body.employmentTypes !== undefined ? { employmentTypes: stringArray(body.employmentTypes, 'employmentTypes', 10) } : {}), ...(body.limit !== undefined ? { limit: boundedNumber(body.limit, 'limit', 1, 100, 25) } : {}) });
    case 'WUZZUF_GET_JOB_DETAILS': return service.wuzzuf.details(requiredString(body.url, 'url', 2_000));
    case 'WUZZUF_SCORE_JOB': return service.wuzzuf.score(jobRef());
    case 'WUZZUF_PREPARE_APPLICATION': return service.wuzzuf.prepare({ ...jobRef(), dryRun: body.dryRun !== false });
    case 'WUZZUF_FILL_APPLICATION': return service.wuzzuf.fill({ applicationId: applicationId(), ...(Array.isArray(body.approvedAnswerOverrides) ? { approvedAnswerOverrides: body.approvedAnswerOverrides.map((value) => { const item = asRecord(value); return { ...(typeof item.fieldId === 'string' ? { fieldId: requiredString(item.fieldId, 'fieldId', 200) } : {}), ...(typeof item.label === 'string' ? { label: requiredString(item.label, 'label', 500) } : {}), value: requiredString(item.value, 'value', 5_000), approved: true as const }; }) } : {}), dryRun: body.dryRun !== false });
    case 'WUZZUF_GET_APPLICATION_REVIEW': return service.wuzzuf.review(applicationId());
    case 'WUZZUF_SUBMIT_APPLICATION': return service.wuzzuf.submit({ applicationId: applicationId(), approvalToken: requiredString(body.approvalToken, 'approvalToken', 200) });
    case 'WUZZUF_GET_APPLICATION_STATUS': return service.wuzzuf.status(applicationId());
    case 'WUZZUF_CANCEL_APPLICATION': return service.wuzzuf.cancel(applicationId());
    case 'WUZZUF_GET_AUTH_STATUS': return service.wuzzuf.authStatus();
    case 'WUZZUF_OPEN_LOGIN': return service.wuzzuf.openLogin();
    case 'WUZZUF_CREATE_APPROVAL_TOKEN': return service.wuzzuf.createApprovalToken(applicationId(), boundedNumber(body.ttlSeconds, 'ttlSeconds', 30, 300, 120));
  }
}

function applySecurityHeaders(req: IncomingMessage, res: ServerResponse, allowedOrigin: string): void {
  const origin = req.headers.origin; if (origin && origin !== allowedOrigin) throw new HttpError(403, 'Origin denied');
  if (origin === allowedOrigin) res.setHeader('access-control-allow-origin', allowedOrigin);
  res.setHeader('vary', 'Origin'); res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS'); res.setHeader('access-control-allow-headers', 'authorization,content-type');
  res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('cache-control', 'no-store'); res.setHeader('referrer-policy', 'no-referrer');
}
function authorize(req: IncomingMessage, sessions: Sessions, toolToken?: string): void { const suppliedTool = req.headers['x-openclaw-tool-token']; if (toolToken && typeof suppliedTool === 'string') { const expected = createHash('sha256').update(toolToken).digest(); const actual = createHash('sha256').update(suppliedTool).digest(); if (timingSafeEqual(expected, actual)) return; } const auth = req.headers.authorization; if (!auth?.startsWith('Bearer ') || !sessions.valid(auth.slice(7))) throw new HttpError(401, 'Pairing required'); }
async function readJson(req: IncomingMessage): Promise<unknown> { let size = 0; const chunks: Buffer[] = []; for await (const chunk of req) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large'); chunks.push(buffer); } return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
function json(res: ServerResponse, status: number, body: unknown): void { if (res.headersSent) return; const value = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(value) }); res.end(value); }
function boundedNumber(value: unknown, field: string, min: number, max: number, fallback: number): number { const number = value === undefined ? fallback : Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new ValidationError(`Invalid ${field}`); return number; }
async function extractResumeText(sourceName: string, base64: string): Promise<string> { const data = Buffer.from(base64, 'base64'); if (data.length > 4 * 1024 * 1024) throw new HttpError(413, 'Resume must be smaller than 4 MB'); if (!sourceName.toLowerCase().endsWith('.pdf')) return data.toString('utf8'); if (data.subarray(0, 4).toString() !== '%PDF') throw new ValidationError('Invalid PDF resume'); const { PDFParse } = await import('pdf-parse'); const parser = new PDFParse({ data }); try { const result = await parser.getText(); return requiredString(result.text, 'resume text', 200_000); } finally { await parser.destroy(); } }
