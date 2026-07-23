import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('Wuzzuf compatibility is a thin alias over the generic application service', async () => {
  const service = await readFile('apps/orchestrator/src/job-application-service.ts', 'utf8');
  const server = await readFile('apps/orchestrator/src/server.ts', 'utf8');
  assert.match(service, /class WuzzufCompatibilityFacade/);
  assert.match(service, /return this\.jobs\.prepareApplication\(input\)/);
  assert.match(service, /return this\.jobs\.submitApplication\(input\)/);
  assert.match(server, /case 'WUZZUF_PREPARE_APPLICATION': return service\.jobs\.prepareApplication/);
  assert.match(server, /case 'WUZZUF_SUBMIT_APPLICATION': return service\.jobs\.submitApplication/);
});
