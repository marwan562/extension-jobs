import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
import { genericRuntimeToolNames, wuzzufRuntimeToolNames } from '../packages/shared-contracts/src/index.ts';
import { runtimeRegisteredToolNames } from '../apps/openclaw-jobs/src/index.ts';

test('generic OpenClaw manifest, runtime, compatibility aliases, and bundled skill stay aligned', async () => {
  const manifest = JSON.parse(await readFile('apps/openclaw-jobs/openclaw.plugin.json', 'utf8')) as { skills: string[]; contracts: { tools: string[] }; configSchema: { properties: Record<string, unknown> } };
  assert.deepEqual([...manifest.contracts.tools].sort(), [...runtimeRegisteredToolNames].sort());
  assert.deepEqual(runtimeRegisteredToolNames.slice(0, genericRuntimeToolNames.length), genericRuntimeToolNames);
  for (const alias of wuzzufRuntimeToolNames) assert.equal(runtimeRegisteredToolNames.includes(alias), true);
  assert.deepEqual(manifest.skills, ['./skills/extension-jobs']); assert.ok(manifest.configSchema.properties.enableSubmissionTool);
  const skill = await readFile('apps/openclaw-jobs/skills/extension-jobs/SKILL.md', 'utf8'); for (const phrase of ['verified profile facts', 'Never call an approval-decision interface', 'Never retry a final submission', 'SECURITY_CHALLENGE_DETECTED', 'job_automation_emergency_stop']) assert.match(skill, new RegExp(phrase));
  const runtime = await readFile('apps/openclaw-jobs/src/index.ts', 'utf8'); for (const path of ['prepare', 'review', 'fill', 'request-submission-approval', 'submit', 'cancel', 'status']) assert.match(runtime, new RegExp(`/v1/applications/${path}`));
  assert.match(runtime, /legacy\(tool, 'wuzzuf_prepare_application'/); assert.doesNotMatch(runtime, /legacy\(tool, 'jobs_prepare_application'/);
});
