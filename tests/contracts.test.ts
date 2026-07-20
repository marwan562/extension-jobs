import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { errorCodes, wuzzufRuntimeToolNames, wuzzufToolActions, WuzzufSearchInputSchema } from '../packages/shared-contracts/src/index.ts';
import { runtimeRegisteredToolNames } from '../apps/openclaw-wuzzuf/src/index.ts';
import { wuzzufToolActions as legacyExports } from '../packages/shared/src/wuzzuf.ts';

test('canonical Wuzzuf contracts drive adapter action and runtime names', async () => {
  assert.deepEqual(legacyExports, wuzzufToolActions);
  assert.deepEqual(runtimeRegisteredToolNames.slice(0, wuzzufRuntimeToolNames.length), wuzzufRuntimeToolNames);
  assert.equal(WuzzufSearchInputSchema.safeParse({ queries: ['backend'], locations: ['Egypt'] }).success, true);
  assert.equal(WuzzufSearchInputSchema.safeParse({ queries: [], locations: [] }).success, false);
  const toolkit = await readFile('packages/composio-wuzzuf/src/index.ts', 'utf8'); for (const action of wuzzufToolActions) assert.match(toolkit, new RegExp(`name: '${action}'`));
});

test('every canonical error code is documented', async () => {
  const docs = await readFile('docs/tool-contracts.md', 'utf8'); for (const code of errorCodes) assert.match(docs, new RegExp(`\\b${code}\\b`));
});
