import test from 'node:test'; import assert from 'node:assert/strict';
import { FixtureJobSource, WuzzufJobSource, IndeedJobSource, WuzzufAdapter, IndeedAdapter } from '../packages/site-adapters/src/index.ts';

test('job source contract returns normalized source inputs', async () => {
  const jobs = await new FixtureJobSource().discover({ queries: ['Node.js'], locations: ['Egypt'] });
  assert.equal(jobs.length, 1);
  assert.ok(jobs[0]?.sourceId);
  assert.ok(new URL(jobs[0]!.url));
});

test('Wuzzuf and Indeed sources and adapters exist and match interface', () => {
  const wuzzufSrc = new WuzzufJobSource();
  const indeedSrc = new IndeedJobSource();
  assert.equal(wuzzufSrc.id, 'wuzzuf');
  assert.equal(indeedSrc.id, 'indeed');

  const wuzzufAd = new WuzzufAdapter();
  const indeedAd = new IndeedAdapter();
  assert.equal(wuzzufAd.matches(new URL('https://wuzzuf.net/jobs/p/123')), true);
  assert.equal(wuzzufAd.matches(new URL('https://example.com')), false);
  assert.equal(indeedAd.matches(new URL('https://www.indeed.com/viewjob?jk=123')), true);
});

