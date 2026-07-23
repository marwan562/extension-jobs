import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../apps/orchestrator/src/store.ts';
import { OrchestratorService } from '../apps/orchestrator/src/service.ts';
import { createBridge } from '../apps/orchestrator/src/server.ts';
import { FixtureJobSource } from '../packages/site-adapters/src/index.ts';
import { DevelopmentProvider } from '../packages/provider-sdk/src/index.ts';
import { normalizeJob } from '../packages/shared/src/jobs.ts';

async function fixture(t: TestContext) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'dashboard-api-')), 'jobs.sqlite'));
  const service = new OrchestratorService(store, new FixtureJobSource(), new DevelopmentProvider());
  const server = createBridge(service, { allowedOrigin: 'http://127.0.0.1:9999', pairingCode: 'dashboard-code', toolToken: 'agent-token' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); store.close(); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  const base = `http://127.0.0.1:${address.port}`;
  return { store, service, base };
}

async function login(base: string) {
  const response = await fetch(`${base}/v1/dashboard/session`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'dashboard-code' })
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { csrfToken: string } };
  const setCookie = response.headers.get('set-cookie');
  const cookie = setCookie?.split(';')[0];
  assert.ok(cookie);
  return { cookie, setCookie, csrf: body.data.csrfToken };
}

test('dashboard uses same-origin HttpOnly cookie and session-bound CSRF', async (t) => {
  const { base } = await fixture(t);
  assert.equal((await fetch(`${base}/v1/dashboard/summary`, { headers: { origin: base } })).status, 401);
  const auth = await login(base);
  assert.match(auth.cookie, /^extension_jobs_dashboard_session=/);
  assert.match(auth.setCookie ?? '', /HttpOnly/i);
  assert.match(auth.setCookie ?? '', /SameSite=Strict/i);
  assert.match(auth.setCookie ?? '', /Path=\//i);
  const summary = await fetch(`${base}/v1/dashboard/summary`, { headers: { origin: base, cookie: auth.cookie } });
  assert.equal(summary.status, 200);
  const noCsrf = await fetch(`${base}/v1/dashboard/emergency-stop`, { method: 'POST', headers: { origin: base, cookie: auth.cookie } });
  assert.equal(noCsrf.status, 403);
  const stopped = await fetch(`${base}/v1/dashboard/emergency-stop`, { method: 'POST', headers: { origin: base, cookie: auth.cookie, 'x-csrf-token': auth.csrf } });
  assert.equal(stopped.status, 200);
  assert.equal((await stopped.json() as { data: { stopped: boolean } }).data.stopped, true);
  assert.equal((await fetch(`${base}/v1/dashboard/summary`, { headers: { origin: 'http://127.0.0.1:7777', cookie: auth.cookie } })).status, 403);
});

test('dashboard jobs are daemon-owned, cursor bounded, and bulk submit is unavailable', async (t) => {
  const { base, store } = await fixture(t);
  const first = normalizeJob({ source: 'development', sourceId: 'one', url: 'https://jobs.lever.co/acme/one', title: 'TypeScript Engineer', employer: 'Acme', location: 'Cairo', description: 'TypeScript Node.js', requiredSkills: ['TypeScript'] });
  const second = normalizeJob({ source: 'development', sourceId: 'two', url: 'https://jobs.lever.co/acme/two', title: 'React Engineer', employer: 'Acme', location: 'Remote', description: 'React accessibility', requiredSkills: ['React'], remote: true });
  store.saveJob({ ...first, matchScore: 84 });
  store.saveJob({ ...second, matchScore: 62 });
  const auth = await login(base);
  const headers = { origin: base, cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' };
  const page = await (await fetch(`${base}/v1/dashboard/jobs?limit=1&sort=score`, { headers })).json() as { data: { items: Array<{ id: string }>; nextCursor: string; total: number } };
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.total, 2);
  assert.ok(page.data.nextCursor);
  const shortlisted = await fetch(`${base}/v1/dashboard/jobs/${first.id}/shortlist`, { method: 'POST', headers, body: '{}' });
  assert.equal(shortlisted.status, 200);
  assert.equal(store.getJobDisposition(first.id), 'shortlisted');
  const unsafe = await fetch(`${base}/v1/dashboard/jobs/bulk`, { method: 'POST', headers, body: JSON.stringify({ ids: [first.id], action: 'submit' }) });
  assert.equal(unsafe.status, 400);
});

test('dashboard preferences, saved views, notes, and manual actions persist through the daemon store', async (t) => {
  const { base, store } = await fixture(t);
  const job = normalizeJob({ source: 'development', sourceId: 'state', url: 'https://jobs.lever.co/acme/state', title: 'Local State Engineer', employer: 'Acme', location: 'Cairo', description: 'SQLite durable state' });
  store.saveJob({ ...job, matchScore: 77 });
  const auth = await login(base);
  const headers = { origin: base, cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/v1/dashboard/jobs/${job.id}/note`, { method: 'PUT', headers, body: JSON.stringify({ note: 'Follow up locally', version: 0 }) })).status, 200);
  assert.equal((await fetch(`${base}/v1/dashboard/jobs/views`, { method: 'POST', headers, body: JSON.stringify({ name: 'Strong matches', query: { minScore: '70' } }) })).status, 201);
  assert.equal((await fetch(`${base}/v1/dashboard/preferences`, { method: 'PUT', headers, body: JSON.stringify({ data: { theme: 'dark' }, version: 0 }) })).status, 200);
  store.saveManualAction({ id: 'manual-1', kind: 'auth_required', status: 'open', title: 'Sign in', detail: { state: 'AUTH_REQUIRED' } });
  assert.equal(store.getJobNote(job.id)?.note, 'Follow up locally');
  assert.equal(store.listJobViews()[0]?.query.minScore, '70');
  assert.equal(store.getDashboardPreference('ui')?.data.theme, 'dark');
  assert.equal(store.listManualActions('open')[0]?.title, 'Sign in');
  assert.equal(store.health().migrationVersion, 4);
});

test('dashboard approval authority is unavailable to OpenClaw and never serializes approval secrets', async (t) => {
  const { base, store } = await fixture(t);
  const auth = await login(base);
  const request = {
    id: 'approval-1',
    applicationId: 'application-1',
    bindingHash: 'binding-secret',
    nonceHash: 'nonce-secret',
    status: 'pending' as const,
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  store.saveApprovalRequest(request);
  assert.equal((await fetch(`${base}/v1/dashboard/approvals/approval-1/decision`, { method: 'POST', headers: { origin: base, 'x-openclaw-tool-token': 'agent-token', 'content-type': 'application/json' }, body: JSON.stringify({ approved: true }) })).status, 401);
  const response = await fetch(`${base}/v1/dashboard/approvals`, { headers: { origin: base, cookie: auth.cookie } });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(text.includes('binding-secret'), false);
  assert.equal(text.includes('nonce-secret'), false);
  assert.equal(text.includes('approvalToken'), false);
});
