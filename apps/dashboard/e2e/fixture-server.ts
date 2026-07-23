import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../../orchestrator/src/store.ts';
import { OrchestratorService } from '../../orchestrator/src/service.ts';
import { createBridge } from '../../orchestrator/src/server.ts';
import { FixtureJobSource } from '../../../packages/site-adapters/src/index.ts';
import { DevelopmentProvider } from '../../../packages/provider-sdk/src/index.ts';
import { importCvText } from '../../../packages/profile-engine/src/index.ts';
import { normalizeJob } from '../../../packages/shared/src/jobs.ts';

const dataRoot = mkdtempSync(join(tmpdir(), 'extension-jobs-dashboard-e2e-'));
process.env.DATA_DIR = dataRoot;
const store = new Store(join(dataRoot, 'jobs.sqlite'));
const service = new OrchestratorService(store, new FixtureJobSource(), new DevelopmentProvider());
const profile = importCvText('Dashboard Fixture', 'fixture.md', 'Email: developer@example.com\nSkills: TypeScript, Node.js, React, Accessibility\nExperience\nBuilt durable local-first systems');
store.saveProfile(profile);

const roles = [
  ['platform', 'Staff Platform Engineer', 'Northstar Systems', 'Cairo, Egypt', 92, ['TypeScript', 'Node.js']],
  ['frontend', 'Senior Product Engineer', 'Atlas Studio', 'Remote', 84, ['React', 'Accessibility']],
  ['backend', 'Backend Engineer', 'Juniper Labs', 'Giza, Egypt', 73, ['Node.js', 'SQL']],
  ['infra', 'Infrastructure Engineer', 'Signal Works', 'Alexandria, Egypt', 58, ['Kubernetes', 'AWS']]
] as const;
for (const [sourceId, title, employer, location, score, skills] of roles) {
  const job = normalizeJob({ source: 'development', sourceId, url: `https://jobs.lever.co/${sourceId}/role`, title, employer, location, description: `Build reliable ${skills.join(' and ')} products with a thoughtful engineering team.`, requiredSkills: [...skills], remote: location === 'Remote', discoveredAt: new Date().toISOString() });
  store.saveJob({ ...job, matchScore: score, scoreExplanation: skills.map((skill, index) => ({ factor: skill, points: 18 - index * 4, reason: `${skill} appears in the verified profile.` })) });
}
const now = new Date().toISOString();
store.saveCampaign({ id: 'fixture-campaign', name: 'High-signal engineering', state: 'enabled', searchQueries: ['TypeScript Engineer'], locations: ['Egypt'], workplace: ['remote', 'hybrid'], includedKeywords: ['TypeScript'], excludedKeywords: [], seniority: ['senior'], minimumMatchScore: 70, allowedSites: ['development'], maxApplicationsPerRun: 5, maxApplicationsPerDay: 10, executionMode: 'research_only', profileId: profile.id, cvStrategy: 'selected', providerId: 'development', model: 'development', dryRun: true, createdAt: now, updatedAt: now });
service.audit('fixture-correlation', 'dashboard.fixture_ready', { jobs: roles.length });

const server = createBridge(service, { allowedOrigin: 'http://127.0.0.1:18970', pairingCode: 'dashboard-e2e' });
server.listen(18970, '127.0.0.1', () => process.stdout.write('Dashboard fixture listening on http://127.0.0.1:18970\n'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => {
  server.close();
  await service.jobs.close();
  store.close();
  process.exit(0);
});

