import test from 'node:test';
import assert from 'node:assert/strict';
import { DestinationResolver, importCurrentPage } from '../packages/destination-resolver/src/index.ts';
import { SitePolicyRegistry, PolicyError } from '../packages/site-policy-registry/src/index.ts';
import { canonicalizeFields, deterministicAnswer, fingerprintForm } from '../packages/universal-form-engine/src/index.ts';

test('site policy is explicit, versioned, and fails closed', () => {
  const registry = new SitePolicyRegistry();
  assert.equal(registry.get('wuzzuf').capabilities.submit, 'browser_approved');
  assert.equal(registry.get('indeed').capabilities.submit, 'manual');
  assert.equal(registry.connectorForHost('evil-example.test'), 'unsupported');
  assert.throws(() => registry.assertCapability('unsupported', 'fill'), PolicyError);
});

test('destination resolver separates job source from ATS destination', () => {
  const resolver = new DestinationResolver();
  const result = resolver.detect('https://www.indeed.com/viewjob?jk=1', { applicationUrl: 'https://jobs.lever.co/example/role' });
  assert.equal(result.destination.adapterId, 'lever');
  assert.equal(result.destination.supported, true);
});

test('current-page JSON-LD import is sanitized and normalized', () => {
  const job = importCurrentPage({ url: 'https://www.indeed.com/viewjob?jk=abc', jsonLd: { '@type': 'JobPosting', identifier: { value: 'abc' }, title: '<b>Senior Engineer</b>', description: '<p>Build TypeScript systems</p>', hiringOrganization: { name: 'Example Labs' }, jobLocation: { address: { addressLocality: 'Cairo', addressCountry: 'Egypt' } }, url: 'https://jobs.lever.co/example/abc', skills: 'TypeScript, Node.js' } });
  assert.equal(job.source.connectorId, 'indeed');
  assert.equal(job.applicationDestination?.adapterId, 'lever');
  assert.equal(job.title, 'Senior Engineer');
  assert.deepEqual(job.requiredSkills, ['TypeScript', 'Node.js']);
});

test('canonical fields are deterministic and sensitive answers require review', () => {
  const fields = canonicalizeFields([{ id: 'email', label: 'Email address', type: 'email', required: true }, { id: 'visa', label: 'Will you require visa sponsorship?', type: 'radio', required: true }]);
  assert.equal(fields[0]?.canonicalId, 'contact.email');
  assert.equal(fields[1]?.canonicalId, 'application.sponsorship_required');
  assert.equal(fields[1]?.sensitive, true);
  const answer = deterministicAnswer(fields[0]!, [{ id: 'fact-1', path: 'contact.email', value: 'candidate@example.com', sourceArtifactId: 'resume-1', confidence: 1, status: 'verified', createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z' }]);
  assert.deepEqual(answer.supportingFactIds, ['fact-1']);
  assert.equal(answer.confirmationRequired, false);
  const first = fingerprintForm('https://jobs.lever.co/example/abc', fields);
  const second = fingerprintForm('https://jobs.lever.co/example/abc', [...fields].reverse());
  assert.equal(first.formVersion, second.formVersion);
});
