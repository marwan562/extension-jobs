import { randomUUID } from 'node:crypto';
import type { CandidateProfile, FieldAnswer, Job, JobCampaign } from '../../../packages/shared/src/domain.ts';
import { deduplicateJobs, normalizeJob, scoreJob } from '../../../packages/shared/src/jobs.ts';
import { schedulePreview } from '../../../packages/shared/src/validation.ts';
import { prepareAnswer } from '../../../packages/profile-engine/src/index.ts';
import type { JobSource } from '../../../packages/site-adapters/src/index.ts';
import type { LlmProvider } from '../../../packages/provider-sdk/src/index.ts';
import { Store } from './store.ts';

export class EmergencyStop {
  private controller = new AbortController(); private stopped = false;
  get signal(): AbortSignal { return this.controller.signal; }
  get active(): boolean { return this.stopped; }
  engage(): void { this.stopped = true; this.controller.abort(new Error('Emergency stop engaged')); }
  reset(): void { this.controller = new AbortController(); this.stopped = false; }
  assertRunning(): void { if (this.stopped) throw new Error('Emergency stop is engaged'); }
}

export class OrchestratorService {
  readonly emergencyStop = new EmergencyStop();
  readonly store: Store; private readonly source: JobSource; private readonly provider: LlmProvider;
  constructor(store: Store, source: JobSource, provider: LlmProvider) { this.store = store; this.source = source; this.provider = provider; }
  audit(correlationId: string, type: string, detail: Record<string, unknown>, applicationId?: string): void { this.store.audit({ id: randomUUID(), correlationId, ...(applicationId ? { applicationId } : {}), type, at: new Date().toISOString(), detail }); }
  saveProfile(profile: CandidateProfile): void { this.store.saveProfile(profile); }
  createCampaign(campaign: JobCampaign): { campaign: JobCampaign; preview: string } { this.emergencyStop.assertRunning(); this.store.saveCampaign(campaign); this.audit(campaign.id, 'campaign.created', { preview: schedulePreview(campaign) }); return { campaign, preview: schedulePreview(campaign) }; }
  async runCampaign(campaign: JobCampaign): Promise<{ correlationId: string; jobs: Job[]; applications: Array<{ id: string; job: Job; answers: FieldAnswer[] }> }> {
    this.emergencyStop.assertRunning(); const correlationId = randomUUID(); const lock = `campaign:${campaign.id}`;
    if (!this.store.acquireLock(lock)) throw new Error('Campaign already running');
    try {
      this.audit(correlationId, 'run.started', { campaignId: campaign.id, dryRun: campaign.dryRun });
      const profile = this.store.getProfile(campaign.profileId); if (!profile) throw new Error('Profile not found');
      const raw = await this.source.discover({ queries: campaign.searchQueries, locations: campaign.locations });
      const normalized = raw.map(normalizeJob); const { unique, duplicateIds } = deduplicateJobs(normalized);
      const jobs = unique.map((job) => scoreJob(job, profile, campaign));
      const applications: Array<{ id: string; job: Job; answers: FieldAnswer[] }> = [];
      for (const job of jobs) {
        if (!this.store.saveJob(job)) { this.audit(correlationId, 'job.duplicate', { fingerprint: job.fingerprint }); continue; }
        if (job.matchScore < campaign.minimumMatchScore) { this.audit(correlationId, 'job.skipped', { score: job.matchScore, reason: 'below_threshold' }); continue; }
        if (campaign.executionMode === 'research_only') { this.audit(correlationId, 'job.selected_research_only', { jobId: job.id, score: job.matchScore }); continue; }
        const id = randomUUID(); this.store.createApplication(id, job.id, { campaignId: campaign.id });
        this.store.transition(id, 'NORMALIZED'); this.store.transition(id, 'DEDUPLICATED'); this.store.transition(id, 'SCORED'); this.store.transition(id, 'SELECTED');
        this.store.transition(id, 'APPLICATION_STARTED'); this.store.transition(id, 'QUESTIONS_EXTRACTED');
        const fields = ['Email address', 'Phone number', 'Will you require visa sponsorship?', 'Expected salary'];
        const answers = fields.map((label) => prepareAnswer(label, profile));
        this.store.transition(id, 'ANSWERS_PREPARED'); this.store.transition(id, 'WAITING_FOR_APPROVAL');
        this.audit(correlationId, 'application.preview_ready', { jobId: job.id, answers, dryRun: campaign.dryRun }, id);
        applications.push({ id, job, answers });
      }
      this.audit(correlationId, 'run.completed', { discovered: raw.length, unique: unique.length, duplicateIds, selected: applications.length });
      return { correlationId, jobs, applications };
    } finally { this.store.releaseLock(lock); }
  }
  async *chat(text: string): AsyncIterable<string> { this.emergencyStop.assertRunning(); yield* this.provider.streamChat({ messages: [{ role: 'user', content: text }], signal: this.emergencyStop.signal }); }
}
