import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig } from './config.ts';
import { ComposioSessionManager } from './session-manager.ts';

const config = loadConfig(); const manager = new ComposioSessionManager(config); await manager.initialize();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, ready: manager.status().ready, toolkits: manager.status().toolkits });
    authorize(req);
    if (req.method === 'GET' && url.pathname === '/v1/session') return json(res, 200, { ok: true, data: manager.status() });
    if (req.method === 'GET' && url.pathname === '/v1/tools') return json(res, 200, { ok: true, data: await manager.tools() });
    if (req.method === 'POST' && url.pathname === '/v1/execute') { const body = await readJson(req); if (typeof body.toolSlug !== 'string' || !body.toolSlug) throw new HostError(400, 'toolSlug is required'); const arguments_ = body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments) ? body.arguments as Record<string, unknown> : {}; const data = await manager.execute(body.toolSlug, arguments_); return json(res, 200, { ok: true, data }); }
    throw new HostError(404, 'Not found');
  } catch (error) { const status = error instanceof HostError ? error.status : 500; return json(res, status, { ok: false, error: { code: status === 500 ? 'COMPOSIO_HOST_ERROR' : 'COMPOSIO_HOST_REQUEST_INVALID', message: status === 500 ? 'Composio session host request failed.' : error instanceof Error ? error.message : 'Request failed', retryable: status >= 500 } }); }
});
server.requestTimeout = 65_000; server.headersTimeout = 10_000; server.listen(config.port, config.host, () => console.log(`Composio session host listening at http://${config.host}:${config.port}`));

class HostError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function authorize(req: IncomingMessage) { const auth = req.headers.authorization; if (!auth?.startsWith('Bearer ')) throw new HostError(401, 'Authentication required'); const expected = createHash('sha256').update(config.hostToken).digest(); const actual = createHash('sha256').update(auth.slice(7)).digest(); if (!timingSafeEqual(expected, actual)) throw new HostError(401, 'Authentication required'); }
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> { let size = 0; const chunks: Buffer[] = []; for await (const chunk of req) { const item = Buffer.from(chunk); size += item.length; if (size > 1024 * 1024) throw new HostError(413, 'Request too large'); chunks.push(item); } const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HostError(400, 'JSON object required'); return parsed as Record<string, unknown>; }
function json(res: ServerResponse, status: number, body: unknown) { const value = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(value), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(value); }
