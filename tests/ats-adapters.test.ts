import test from 'node:test'; import assert from 'node:assert/strict';
import { AtsBrowserAdapter, createAtsAdapterRegistry } from '../packages/ats-adapters/src/index.ts';

test('ATS registry detects reviewed hosts and rejects cross-adapter URLs', async () => {
  const registry = createAtsAdapterRegistry(); assert.deepEqual([...registry.keys()], ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'workday']);
  const lever = registry.get('lever')!; assert.equal((await lever.detect(new URL('https://jobs.lever.co/example/role'))).matched, true); assert.equal((await lever.detect(new URL('https://evil.example/role'))).matched, false);
  const policy = await lever.capabilities({ correlationId: 'corr', userPresent: true, dryRun: true, signal: new AbortController().signal }); assert.equal(policy.submit, 'browser_approved');
  assert.ok(new AtsBrowserAdapter('greenhouse'));
});
