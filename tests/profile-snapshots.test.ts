import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../apps/orchestrator/src/store.ts';
import { importCvText, updateProfileFact } from '../packages/profile-engine/src/index.ts';

test('profile facts and resume changes create immutable snapshots', () => { const store = new Store(join(mkdtempSync(join(tmpdir(), 'profile-snapshot-')), 'db.sqlite')); const profile = importCvText('Candidate', 'resume.txt', 'candidate@example.com\nSkills: Node.js, TypeScript'); store.saveProfile(profile); const initial = store.latestProfileSnapshot(profile.id)!; const resume = profile.cvVariants[0]!; store.saveResumeFile(profile.id, resume.id, resume.sourceName, Buffer.from('resume bytes')); const withResume = store.latestProfileSnapshot(profile.id)!; assert.notEqual(withResume.id, initial.id); assert.equal(withResume.resumeFileId, resume.id); assert.notEqual(withResume.resumeHash, initial.resumeHash); const fact = profile.facts.find((item) => item.path === 'identity.email')!; store.saveProfile(updateProfileFact(profile, fact.id, 'new@example.com')); const snapshots = store.listProfileSnapshots(profile.id); assert.ok(snapshots.length >= 3); assert.equal(snapshots[0]!.facts.find((item) => item.id === fact.id)?.value, 'candidate@example.com'); assert.equal(snapshots.at(-1)!.facts.find((item) => item.id === fact.id)?.value, 'new@example.com'); store.close(); });
