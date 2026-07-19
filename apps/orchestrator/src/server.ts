import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { importCvText, updateProfileFact } from '../../../packages/profile-engine/src/index.ts';
import { parseFriendlySchedule, ValidationError, asRecord, requiredString, stringArray, validateTimezone } from '../../../packages/shared/src/validation.ts';
import type { ExecutionMode, JobCampaign } from '../../../packages/shared/src/domain.ts';
import { OrchestratorService } from './service.ts';

const MAX_BODY_BYTES = 64 * 1024;

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

export interface BridgeOptions { allowedOrigin: string; pairingCode: string; sessionTtlMs?: number }

export function createBridge(service: OrchestratorService, options: BridgeOptions) {
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(options.allowedOrigin) && !options.allowedOrigin.startsWith('http://127.0.0.1:')) throw new Error('An exact extension or loopback development origin is required');
  const sessions = new Sessions(options.pairingCode, options.sessionTtlMs ?? 15 * 60_000);
  return createServer(async (req, res) => {
    try {
      applySecurityHeaders(req, res, options.allowedOrigin);
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, emergencyStop: service.emergencyStop.active });
      if (req.method === 'POST' && url.pathname === '/v1/pair') { const body = asRecord(await readJson(req)); return json(res, 200, sessions.pair(requiredString(body.code, 'code', 256))); }
      authorize(req, sessions);
      if (req.method === 'GET' && url.pathname === '/v1/dashboard') return json(res, 200, { campaigns: service.store.listCampaigns(), profiles: service.store.listProfiles(), timeline: service.store.timeline(), emergencyStop: service.emergencyStop.active });
      if (req.method === 'POST' && url.pathname === '/v1/profiles/import') {
        const body = asRecord(await readJson(req)); const profile = importCvText(requiredString(body.name, 'name', 100), requiredString(body.sourceName, 'sourceName', 200), requiredString(body.text, 'text', 50_000)); service.saveProfile(profile); service.audit(profile.id, 'profile.imported', { sourceName: profile.cvVariants[0]!.sourceName, factCount: profile.facts.length }); return json(res, 201, profile);
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
        const body = asRecord(await readJson(req)); const text = requiredString(body.text, 'text', 8_000); res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
        for await (const chunk of service.chat(text)) res.write(`${JSON.stringify({ type: 'chunk', text: chunk })}\n`); res.end(`${JSON.stringify({ type: 'done' })}\n`); return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/emergency-stop') { service.emergencyStop.engage(); service.audit(randomUUID(), 'emergency_stop.engaged', {}); return json(res, 200, { stopped: true }); }
      if (req.method === 'POST' && url.pathname === '/v1/emergency-stop/reset') { service.emergencyStop.reset(); return json(res, 200, { stopped: false }); }
      throw new HttpError(404, 'Not found');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof ValidationError || error instanceof SyntaxError ? 400 : 500;
      json(res, status, { error: status === 500 ? 'Internal server error' : error instanceof Error ? error.message : 'Request failed' });
    }
  });
}

function applySecurityHeaders(req: IncomingMessage, res: ServerResponse, allowedOrigin: string): void {
  const origin = req.headers.origin; if (origin && origin !== allowedOrigin) throw new HttpError(403, 'Origin denied');
  if (origin === allowedOrigin) res.setHeader('access-control-allow-origin', allowedOrigin);
  res.setHeader('vary', 'Origin'); res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS'); res.setHeader('access-control-allow-headers', 'authorization,content-type');
  res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('cache-control', 'no-store'); res.setHeader('referrer-policy', 'no-referrer');
}
function authorize(req: IncomingMessage, sessions: Sessions): void { const auth = req.headers.authorization; if (!auth?.startsWith('Bearer ') || !sessions.valid(auth.slice(7))) throw new HttpError(401, 'Pairing required'); }
async function readJson(req: IncomingMessage): Promise<unknown> { let size = 0; const chunks: Buffer[] = []; for await (const chunk of req) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large'); chunks.push(buffer); } return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
function json(res: ServerResponse, status: number, body: unknown): void { if (res.headersSent) return; const value = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(value) }); res.end(value); }
function boundedNumber(value: unknown, field: string, min: number, max: number, fallback: number): number { const number = value === undefined ? fallback : Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new ValidationError(`Invalid ${field}`); return number; }
