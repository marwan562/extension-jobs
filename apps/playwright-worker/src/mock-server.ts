import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function startMockSite(port = 18791) {
  const fixture = resolve('apps/playwright-worker/fixtures/mock-application.html');
  const server = createServer(async (req, res) => {
    if (req.url !== '/mock-application') { res.writeHead(404); res.end('Not found'); return; }
    const body = await readFile(fixture); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length }); res.end(body);
  });
  return new Promise<ReturnType<typeof createServer>>((resolvePromise) => server.listen(port, '127.0.0.1', () => resolvePromise(server)));
}
