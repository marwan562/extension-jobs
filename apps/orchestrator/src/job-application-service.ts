import { randomUUID } from 'node:crypto';
import type { ConnectorId, NormalizedJob } from '../../../packages/shared-contracts/src/index.ts';
import type { JobSource } from '../../../packages/site-adapters/src/index.ts';
import { normalizeJob } from '../../../packages/shared/src/jobs.ts';
import { scoreJob } from '../../../packages/shared/src/jobs.ts';
import type { JobCampaign } from '../../../packages/shared/src/domain.ts';
import { DestinationResolver, importCurrentPage, type CurrentPageInput } from '../../../packages/destination-resolver/src/index.ts';
import { SitePolicyRegistry } from '../../../packages/site-policy-registry/src/index.ts';
import type { Store } from './store.ts';

export class JobApplicationService {
  readonly policies: SitePolicyRegistry;
  readonly destinations: DestinationResolver;
  private readonly store: Store; private readonly source: JobSource;
  constructor(store: Store, source: JobSource, policies = new SitePolicyRegistry()) { this.store = store; this.source = source; this.policies = policies; this.destinations = new DestinationResolver(policies); }

  capabilities(connectorId: ConnectorId): { enabled: boolean; policy: ReturnType<SitePolicyRegistry['get']> };
  capabilities(): Array<{ enabled: boolean; policy: ReturnType<SitePolicyRegistry['get']> }>;
  capabilities(connectorId?: ConnectorId) {
    return connectorId ? { enabled: this.policies.isEnabled(connectorId), policy: this.policies.get(connectorId) } : this.policies.list().map((policy) => ({ enabled: this.policies.isEnabled(policy.connectorId), policy }));
  }
  configureConnector(connectorId: ConnectorId, enabled: boolean) { const policy = this.policies.get(connectorId); if (connectorId === 'unsupported') throw new Error('CONNECTOR_DISABLED'); enabled ? this.policies.enable(connectorId) : this.policies.disable(connectorId); this.store.setConnectorEnabled(connectorId, enabled, policy.version); return { enabled: this.policies.isEnabled(connectorId), policy }; }

  async search(input: { queries: string[]; locations: string[]; limit?: number }): Promise<{ operationId: string; jobs: NormalizedJob[] }> {
    if (!input.queries.length || !input.locations.length) throw new Error('APPLICATION_INPUT_REQUIRED');
    const raws = await this.source.discover({ queries: input.queries.slice(0, 10), locations: input.locations.slice(0, 10) });
    const jobs = raws.slice(0, input.limit ?? 100).map((raw) => {
      const legacy = normalizeJob(raw); const connectorId = this.policies.connectorForHost(new URL(raw.url).hostname);
      const destination = this.destinations.detect(raw.url).destination;
      const normalized: NormalizedJob = { id: legacy.id, fingerprint: legacy.fingerprint, title: legacy.title, employer: legacy.employer, location: legacy.location, description: legacy.description, url: legacy.url, source: { connectorId, externalId: legacy.sourceId, discoveredAt: legacy.discoveredAt ?? new Date().toISOString(), discoveryMode: this.policies.get(connectorId).capabilities.discovery }, applicationDestination: destination, requiredSkills: legacy.requiredSkills ?? [], preferredSkills: legacy.preferredSkills ?? [], remote: legacy.remote ?? false, matchScore: legacy.matchScore };
      this.store.upsertJob(legacy); return normalized;
    });
    return { operationId: randomUUID(), jobs };
  }

  importCurrentPage(input: CurrentPageInput): { operationId: string; job: NormalizedJob } {
    const job = importCurrentPage(input, this.destinations, this.policies);
    const legacy = normalizeJob({ source: job.source.connectorId, sourceId: job.source.externalId, url: job.url, title: job.title, employer: job.employer, location: job.location, description: job.description, requiredSkills: job.requiredSkills, preferredSkills: job.preferredSkills, remote: job.remote, discoveredAt: job.source.discoveredAt });
    this.store.upsertJob({ ...legacy, id: job.id, fingerprint: job.fingerprint });
    return { operationId: randomUUID(), job };
  }

  details(input: { jobId?: string; url?: string }): { operationId: string; job: NormalizedJob } {
    const legacy = input.jobId ? this.store.getJob(input.jobId) : input.url ? this.store.getJobByUrl(input.url) : undefined;
    if (!legacy) throw new Error('JOB_NOT_FOUND');
    const connectorId = this.policies.connectorForHost(new URL(legacy.url).hostname);
    return { operationId: randomUUID(), job: { id: legacy.id, fingerprint: legacy.fingerprint, title: legacy.title, employer: legacy.employer, location: legacy.location, description: legacy.description, url: legacy.url, source: { connectorId, externalId: legacy.sourceId, discoveredAt: legacy.discoveredAt ?? new Date().toISOString(), discoveryMode: this.policies.get(connectorId).capabilities.discovery }, applicationDestination: this.destinations.detect(legacy.url).destination, requiredSkills: legacy.requiredSkills ?? [], preferredSkills: legacy.preferredSkills ?? [], remote: legacy.remote ?? false, matchScore: legacy.matchScore } };
  }

  score(input: { jobId: string; profileId?: string }): { operationId: string; jobId: string; score: number; explanation: Array<{ factor: string; points: number; reason: string }> } {
    const legacy = this.store.getJob(input.jobId); if (!legacy) throw new Error('JOB_NOT_FOUND');
    const profile = input.profileId ? this.store.getProfile(input.profileId) ?? this.store.registeredCandidateProfile(input.profileId) : this.store.listProfiles()[0] ?? this.store.registeredCandidateProfile();
    if (!profile) throw new Error('PROFILE_INCOMPLETE');
    const now = new Date().toISOString(); const campaign: JobCampaign = { id: `score-${legacy.id}`, name: 'One-job score', state: 'enabled', searchQueries: [legacy.title], locations: [legacy.location], workplace: legacy.remote ? ['remote'] : ['onsite'], includedKeywords: [], excludedKeywords: [], seniority: legacy.seniority ? [legacy.seniority] : [], minimumMatchScore: 0, allowedSites: [legacy.source], maxApplicationsPerRun: 1, maxApplicationsPerDay: 1, executionMode: 'research_only', profileId: profile.id, cvStrategy: 'selected', providerId: 'local', model: 'deterministic', dryRun: true, createdAt: now, updatedAt: now };
    const scored = scoreJob(legacy, profile, campaign); this.store.upsertJob(scored);
    return { operationId: randomUUID(), jobId: scored.id, score: scored.matchScore, explanation: scored.scoreExplanation };
  }
}
