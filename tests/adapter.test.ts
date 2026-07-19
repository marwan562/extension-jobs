import test from 'node:test'; import assert from 'node:assert/strict';
import { FixtureJobSource } from '../packages/site-adapters/src/index.ts';
test('job source contract returns normalized source inputs', async () => { const jobs = await new FixtureJobSource().discover({ queries: ['Node.js'], locations: ['Egypt'] }); assert.equal(jobs.length, 1); assert.ok(jobs[0]?.sourceId); assert.ok(new URL(jobs[0]!.url)); });
