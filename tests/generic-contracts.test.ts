import test from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationFormSchema, ConnectorCapabilitiesSchema, NormalizedJobSchema, SitePolicySchema, genericRuntimeToolNames } from '../packages/shared-contracts/src/index.ts';

test('generic contracts are strict and focused tool names remain individual', () => {
  assert.equal(ConnectorCapabilitiesSchema.safeParse({ discovery: 'user_triggered', details: 'user_triggered', fill: 'assisted', submit: 'manual', requiresUserPresence: true, requiresSubmissionApproval: true }).success, true);
  assert.equal(ConnectorCapabilitiesSchema.safeParse({ discovery: 'anything' }).success, false);
  assert.equal(new Set(genericRuntimeToolNames).size, genericRuntimeToolNames.length);
  assert.equal(genericRuntimeToolNames.includes('jobs_search'), true);
  assert.equal((genericRuntimeToolNames as readonly string[]).includes('job_automation'), false);
  assert.ok(NormalizedJobSchema);
  assert.ok(SitePolicySchema);
  assert.ok(ApplicationFormSchema);
});
