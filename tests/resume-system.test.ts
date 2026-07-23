import test from 'node:test'; import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { ArtifactStore } from '../packages/artifact-store/src/index.ts';
import { ResumeVault } from '../packages/resume-importers/src/index.ts';
import { tailorResume, validateResumeDocument } from '../packages/resume-tailor/src/index.ts';
import type { NormalizedJob } from '../packages/shared-contracts/src/index.ts';
import { Store } from '../apps/orchestrator/src/store.ts';

test('resume vault validates format, copies to opaque storage, and does not expose source path', async () => {
  const root = mkdtempSync(join(tmpdir(), 'extension-jobs-resume-')); const sourcePath = join(root, 'candidate.md'); writeFileSync(sourcePath, '# Candidate\n\nSkills: TypeScript, Node.js\n\nExperience\nExample Labs - Backend Engineer\n');
  const result = await new ResumeVault(new ArtifactStore(join(root, 'vault'))).importPath('profile-1', sourcePath);
  assert.equal(result.source.mediaType, 'text/markdown'); assert.equal(result.source.approved, false); assert.equal(JSON.stringify(result.source).includes(sourcePath), false); assert.equal(result.profile.skills.length, 2);
});

test('tailoring selects verified facts and rejects unsupported lines', async () => {
  const root = mkdtempSync(join(tmpdir(), 'extension-jobs-tailor-')); const sourcePath = join(root, 'candidate.txt'); writeFileSync(sourcePath, 'Skills: TypeScript, Node.js\nExperience\nBuilt TypeScript services at Example Labs\n'); const imported = await new ResumeVault(new ArtifactStore(join(root, 'vault'))).importPath('profile-1', sourcePath);
  imported.profile.facts = imported.profile.facts.map((fact) => ({ ...fact, status: 'verified' as const })); imported.profile.skills = imported.profile.facts.filter((fact) => fact.path.startsWith('skills.')); imported.profile.employment = imported.profile.facts.filter((fact) => fact.path.startsWith('employment.'));
  const job: NormalizedJob = { id: 'job-1', fingerprint: 'a'.repeat(64), title: 'Senior TypeScript Engineer', employer: 'Example', location: 'Cairo', description: 'Build Node.js services', url: 'https://jobs.lever.co/example/job-1', source: { connectorId: 'lever', externalId: 'job-1', discoveredAt: '2026-07-22T00:00:00.000Z', discoveryMode: 'official_api' }, requiredSkills: ['TypeScript', 'Kubernetes'], preferredSkills: [], remote: false };
  const tailored = tailorResume({ sourceResumeId: imported.source.id, profileSnapshotId: 'snapshot-1', profile: imported.profile, job }); assert.equal(tailored.validation.valid, true); assert.deepEqual(tailored.review.missingRequirements, ['Kubernetes']); assert.equal(tailored.document.sections.flatMap((section) => section.lines).every((line) => line.supportingFactIds.length > 0), true);
  const tampered = structuredClone(tailored.document); tampered.sections[0]!.lines.push({ text: 'Invented achievement', supportingFactIds: [] }); assert.equal(validateResumeDocument(tampered, imported.profile.facts).valid, false);
});

test('resume and connector administration use the daemon database as source of truth', async () => {
  const root = mkdtempSync(join(tmpdir(), 'extension-jobs-resume-store-')); const sourcePath = join(root, 'candidate.md'); writeFileSync(sourcePath, 'Skills: TypeScript\nExperience\nExample Labs - Engineer\n'); const vault = new ArtifactStore(join(root, 'vault')); const imported = await new ResumeVault(vault).importPath('profile-1', sourcePath); const store = new Store(join(root, 'jobs.sqlite'));
  store.saveRegisteredResume(imported.source, imported.sourceArtifactId, imported.profile); assert.equal(store.listRegisteredResumes().length, 1); assert.equal(store.approveRegisteredResume(imported.source.id)?.profile.facts.every((fact) => fact.status === 'verified'), true);
  store.setConnectorEnabled('linkedin', false, 'test-v1'); assert.deepEqual(store.connectorSettings().map(({ connectorId, enabled }) => ({ connectorId, enabled })), [{ connectorId: 'linkedin', enabled: false }]); const artifactId = store.removeRegisteredResume(imported.source.id); assert.equal(artifactId, imported.sourceArtifactId); vault.remove(artifactId!); assert.equal(store.listRegisteredResumes().length, 0); store.close();
});
