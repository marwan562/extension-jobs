import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
import { composioJobsToolSlugs, createJobsToolkit } from '../packages/composio-jobs/src/index.ts';

test('generic Composio JOBS toolkit is thin, strict, least-privilege, and has no submit tool', async () => {
  const toolkit = createJobsToolkit(); assert.equal(toolkit.slug, 'JOBS'); assert.deepEqual(toolkit.tools.map((tool) => tool.slug), composioJobsToolSlugs); assert.equal(toolkit.tools.some((tool) => tool.slug.includes('SUBMIT_APPLICATION')), false);
  for (const tool of toolkit.tools) { assert.equal(tool.inputParams.safeParse({ unexpected: true }).success, false); assert.ok(tool.outputSchema); }
  const source = [await readFile('packages/composio-jobs/src/index.ts', 'utf8'), await readFile('packages/composio-jobs/src/orchestrator-client.ts', 'utf8')].join('\n'); assert.doesNotMatch(source, /playwright|locator\(|page\.goto|storageState|document\.cookie|approvalToken|resume bytes/i); assert.match(source, /x-composio-tool-token/);
  assert.match(source, /\/v1\/applications\/prepare/); assert.doesNotMatch(source, /client\.wuzzuf\('WUZZUF_(?:PREPARE|FILL|GET_APPLICATION|REQUEST_SUBMISSION|CANCEL)/);
});
