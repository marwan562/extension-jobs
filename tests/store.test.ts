import test from 'node:test'; import assert from 'node:assert/strict'; import { mkdtempSync, statSync } from 'node:fs'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../apps/orchestrator/src/store.ts';
test('submission reservation is idempotent across restart', () => { const path = join(mkdtempSync(join(tmpdir(), 'jobs-store-')), 'db.sqlite'); const first = new Store(path); first.createApplication('a1', 'j1', {}); assert.equal(first.reserveSubmission('a1', 'site:job:candidate'), true); first.close(); const second = new Store(path); assert.equal(second.reserveSubmission('a1', 'site:job:candidate'), false); second.close(); });


test('store protects local data files and stale locks expire safely', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'private-store-')); const path = join(directory, 'db.sqlite');
  const first = new Store(path, { lockLeaseMs: 60_000 }); assert.equal(first.acquireLock('campaign:test'), true); first.close();
  if (process.platform !== 'win32') {
    assert.equal(statSync(directory).mode & 0o077, 0);
    assert.equal(statSync(path).mode & 0o077, 0);
  }
  const beforeExpiry = new Store(path, { lockLeaseMs: 60_000 }); assert.equal(beforeExpiry.acquireLock('campaign:test'), false); beforeExpiry.close();
  const database = new DatabaseSync(path); database.prepare("UPDATE locks SET expires_at='1970-01-01T00:00:00.000Z' WHERE key=?").run('campaign:test'); database.close();
  const afterExpiry = new Store(path, { lockLeaseMs: 60_000 }); assert.equal(afterExpiry.acquireLock('campaign:test'), true); afterExpiry.releaseLock('campaign:test'); afterExpiry.close();
});
