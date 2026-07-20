import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyCoreMigrations, DurableQueue } from '../packages/persistence/src/index.ts';

test('durable queue claims atomically, recovers leases, and never retries submission', () => {
  const dir = mkdtempSync(join(tmpdir(), 'extension-jobs-queue-')); const db = new DatabaseSync(join(dir, 'queue.sqlite')); applyCoreMigrations(db); const queue = new DurableQueue(db);
  const search = queue.enqueue('wuzzuf.search', { query: 'node' }, { maxAttempts: 3 }); const claimed = queue.claim('worker-1'); assert.equal(claimed?.id, search.id); assert.equal(claimed?.attempts, 1); assert.equal(queue.complete(search.id, 'worker-2'), false); assert.equal(queue.complete(search.id, 'worker-1'), true);
  const submit = queue.enqueue('wuzzuf.submit-application', { applicationId: 'app-1' }, { maxAttempts: 99 }); assert.equal(submit.maxAttempts, 1); assert.equal(queue.claim('worker-1')?.id, submit.id); assert.equal(queue.fail(submit.id, 'worker-1', 'BROWSER_UNAVAILABLE', true), true); assert.equal(queue.claim('worker-2'), undefined); assert.equal(queue.health().failed, 1); db.close();
});
