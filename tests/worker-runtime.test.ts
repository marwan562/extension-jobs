import test from 'node:test'; import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { DatabaseSync } from 'node:sqlite';
import { applyCoreMigrations, DurableQueue } from '../packages/persistence/src/index.ts';
import { BrowserWorkerRuntime } from '../apps/playwright-worker/src/worker-runtime.ts';
import { openWorkerRequest, sealWorkerRequest } from '../apps/orchestrator/src/wuzzuf-tool-service.ts';
import { Store } from '../apps/orchestrator/src/store.ts'; import { OrchestratorService } from '../apps/orchestrator/src/service.ts'; import { FixtureJobSource, WuzzufAdapter } from '../packages/site-adapters/src/index.ts'; import { DevelopmentProvider } from '../packages/provider-sdk/src/index.ts'; import { createWuzzufWorkerHandlers } from '../apps/playwright-worker/src/wuzzuf-worker-handler.ts';
import { LocalWorkerClient } from '../apps/orchestrator/src/worker-client.ts'; import { WorkerJobSource } from '../apps/orchestrator/src/worker-job-source.ts'; import { createGenericSearchHandler } from '../apps/playwright-worker/src/generic-search-handler.ts';

test('standalone worker records progress and results through a durable lease', async () => {
  const db = new DatabaseSync(join(mkdtempSync(join(tmpdir(), 'extension-jobs-worker-')), 'queue.sqlite')); applyCoreMigrations(db); const queue = new DurableQueue(db);
  const job = queue.enqueue('application.inspect', { applicationId: 'app-1' });
  const runtime = new BrowserWorkerRuntime(queue, { workerId: 'worker-test', handlers: new Map([['application.inspect', async (_job, context) => { context.progress(50, 'inspected'); return { fields: 3 }; }]]) });
  assert.equal(await runtime.pollOnce(), true); assert.equal(queue.get(job.id)?.status, 'completed'); assert.deepEqual(queue.result(job.id)?.result, { fields: 3 }); assert.deepEqual(queue.progressEvents(job.id).map((event) => event.progress), [0, 50, 100]); db.close();
});

test('generic final submission is capped at one attempt and never retried', async () => {
  const db = new DatabaseSync(join(mkdtempSync(join(tmpdir(), 'extension-jobs-submit-worker-')), 'queue.sqlite')); applyCoreMigrations(db); const queue = new DurableQueue(db);
  const job = queue.enqueue('application.submit', { applicationId: 'app-1' }, { maxAttempts: 9 }); assert.equal(job.maxAttempts, 1);
  const runtime = new BrowserWorkerRuntime(queue, { workerId: 'worker-test', handlers: new Map([['application.submit', async () => { throw new Error('uncertain'); }]]) });
  await runtime.pollOnce(); assert.equal(queue.get(job.id)?.status, 'failed'); assert.equal(await runtime.pollOnce(), false); db.close();
});

test('worker requests are encrypted, authenticated, and reject the wrong worker token', () => {
  const token = 'worker-token-with-at-least-32-characters'; const request = { action: 'submit' as const, input: { applicationId: 'app', approvalToken: 'one-use-secret' } }; const sealed = sealWorkerRequest(request, token);
  assert.doesNotMatch(JSON.stringify(sealed), /one-use-secret|applicationId/); assert.deepEqual(openWorkerRequest(sealed, token), request);
  assert.throws(() => openWorkerRequest(sealed, 'different-worker-token-32-characters'), /authentication failed/);
});

test('production coordinator delegates authenticated work to a separate durable worker', async () => {
  const root = mkdtempSync(join(tmpdir(), 'extension-jobs-worker-boundary-')); const database = join(root, 'jobs.sqlite'); const token = 'worker-token-with-at-least-32-characters'; const coordinatorStore = new Store(database); const workerStore = new Store(database);
  const fakeAdapter = { discover: async () => [{ source: 'wuzzuf', sourceId: 'worker-job', url: 'https://wuzzuf.net/jobs/worker-job', title: 'Worker Engineer', employer: 'Example', location: 'Cairo', description: 'Node.js', requiredSkills: ['Node.js'], remote: true }], browserStatus: () => ({ connected: true }), close: async () => undefined } as unknown as WuzzufAdapter;
  const workerService = new OrchestratorService(workerStore, new FixtureJobSource(), new DevelopmentProvider(), fakeAdapter, { wuzzufExecutionMode: 'direct', workerToken: token }); const coordinatorService = new OrchestratorService(coordinatorStore, new FixtureJobSource(), new DevelopmentProvider(), fakeAdapter, { wuzzufExecutionMode: 'coordinator', workerToken: token, workerTimeoutMs: 2_000 });
  const runtime = new BrowserWorkerRuntime(workerStore.queue, { workerId: 'browser-worker:test', handlers: createWuzzufWorkerHandlers(workerService, token), pollMs: 5 }); runtime.start();
  try { const result = await coordinatorService.wuzzuf.search({ queries: ['Node.js'], locations: ['Egypt'], limit: 1 }); assert.equal(result.jobs[0]?.title, 'Worker Engineer'); assert.equal(coordinatorStore.queue.health().completed, 1); }
  finally { await runtime.stop(); await coordinatorService.wuzzuf.close(); await workerService.wuzzuf.close(); coordinatorStore.close(); workerStore.close(); }
});

test('production generic discovery crosses the encrypted standalone-worker boundary', async () => {
  const root = mkdtempSync(join(tmpdir(), 'extension-jobs-generic-source-worker-')); const database = join(root, 'jobs.sqlite'); const token = 'generic-source-worker-token-long-enough'; const coordinatorStore = new Store(database); const workerStore = new Store(database); const fixture = new FixtureJobSource();
  const runtime = new BrowserWorkerRuntime(workerStore.queue, { workerId: 'generic-source-worker:test', handlers: new Map([['jobs.search', createGenericSearchHandler(fixture, token)]]), pollMs: 5 }); runtime.start();
  try { const source = new WorkerJobSource(new LocalWorkerClient(coordinatorStore, token, 2_000)); const jobs = await source.discover({ queries: ['Platform'], locations: ['Cairo'] }); assert.match(jobs[0]?.title ?? '', /Platform/); assert.equal(coordinatorStore.queue.health().completed, 1); }
  finally { await runtime.stop(); coordinatorStore.close(); workerStore.close(); }
});
