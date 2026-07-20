import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function startMockSite(port = 18791) {
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname;
    const fixtures: Record<string, string> = { '/mock-application': 'mock-application.html', '/search/jobs': 'wuzzuf/search-results.html', '/search/jobs/': 'wuzzuf/search-results.html', '/jobs/p/mock-node-1': 'wuzzuf/job-details.html', '/jobs/p/mock-frontend-2': 'wuzzuf/job-details.html', '/apply/mock-node-1': 'wuzzuf/application-form.html', '/fixture/multi-step': 'wuzzuf/multi-step-application.html', '/fixture/validation-errors': 'wuzzuf/validation-errors.html', '/login': 'wuzzuf/login-required.html', '/fixture/challenge': 'wuzzuf/challenge.html', '/fixture/unsupported': 'wuzzuf/unsupported-layout.html' };
    if (pathname === '/me/applications' || pathname === '/explore') { const body = Buffer.from('<!doctype html><html><body><a href="/explore">Applications</a><a href="/me/applications">My Applications</a></body></html>'); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length }); res.end(body); return; }
    const selected = fixtures[pathname]; if (!selected) { res.writeHead(404); res.end('Not found'); return; }
    const body = await readFile(resolve('apps/playwright-worker/fixtures', selected)); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length }); res.end(body);
  });
  return new Promise<ReturnType<typeof createServer>>((resolvePromise) => server.listen(port, '127.0.0.1', () => resolvePromise(server)));
}
