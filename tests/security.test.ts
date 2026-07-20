import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLoopbackUrl, assertWuzzufUrl, hashSecret, sanitizeDiagnostics, secureHashEquals } from '../packages/security/src/index.ts';

test('central sanitizer removes secrets and local browser details recursively', () => {
  const value = sanitizeDiagnostics({ authorization: 'Bearer super-secret', nested: { cookie: 'session=x', message: 'failed at /Users/person/private/file.txt', token: 'approval' }, safe: 'ok' });
  assert.deepEqual(value, { authorization: '[REDACTED]', nested: { cookie: '[REDACTED]', message: 'failed at [LOCAL_PATH]', token: '[REDACTED]' }, safe: 'ok' });
  assert.equal(JSON.stringify(value).includes('super-secret'), false);
});

test('secret comparison and URL allowlists are strict', () => {
  const hash = hashSecret('correct horse battery staple'); assert.equal(secureHashEquals('correct horse battery staple', hash), true); assert.equal(secureHashEquals('wrong', hash), false);
  assert.equal(assertLoopbackUrl('http://127.0.0.1:18790').hostname, '127.0.0.1'); assert.throws(() => assertLoopbackUrl('https://example.com'));
  assert.equal(assertWuzzufUrl('https://wuzzuf.net/jobs/p/abc').hostname, 'wuzzuf.net'); assert.throws(() => assertWuzzufUrl('https://wuzzuf.net.evil.example/jobs/p/abc'));
});
