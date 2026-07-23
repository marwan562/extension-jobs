import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Job, JobCampaign } from '../../../packages/shared/src/domain.ts';
import { WuzzufToolError, type PreparedApplicationRecord } from '../../../packages/shared/src/wuzzuf.ts';
import { sanitizeAuditDetail } from '../../../packages/security/src/index.ts';
import { ArtifactStore } from '../../../packages/artifact-store/src/index.ts';
import { ResumeVault } from '../../../packages/resume-importers/src/index.ts';
import { tailorResume } from '../../../packages/resume-tailor/src/index.ts';
import { connectorIds, type Artifact, type ConnectorId, type NormalizedJob } from '../../../packages/shared-contracts/src/index.ts';
import { resolve } from 'node:path';
import type { OrchestratorService } from './service.ts';
import type { TailoredResumeRecord } from './store.ts';
import type { LocalWorkerClient } from './worker-client.ts';

const COOKIE_NAME = 'extension_jobs_dashboard_session';
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MANUAL_STATES = new Set(['AUTH_REQUIRED', 'SECURITY_CHALLENGE_REQUIRED', 'SECURITY_CHECK_REQUIRED', 'FORM_CHANGED', 'POLICY_BLOCKED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT']);

interface DashboardSession {
  csrfHash: string;
  expiresAt: number;
}

export class DashboardSessions {
  private readonly pairingHash: Buffer;
  private readonly ttlMs: number;
  private readonly sessions = new Map<string, DashboardSession>();
  private readonly approvalTokens = new Map<string, { token: string; expiresAt: number }>();
  private loginWindow = { startedAt: Date.now(), count: 0 };
  private readonly requestWindows = new Map<string, { startedAt: number; count: number }>();

  constructor(pairingCode: string, ttlMs = 15 * 60_000) {
    this.pairingHash = createHash('sha256').update(pairingCode).digest();
    this.ttlMs = Math.min(Math.max(ttlMs, 60_000), 60 * 60_000);
  }

  login(code: string, response: ServerResponse): { authenticated: true; csrfToken: string; expiresAt: string } {
    this.limitLogin();
    this.verifyPairing(code);
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + this.ttlMs;
    this.sessions.set(hash(sessionToken), { csrfHash: hash(csrfToken), expiresAt });
    response.setHeader('set-cookie', `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(this.ttlMs / 1000)}`);
    return { authenticated: true, csrfToken, expiresAt: new Date(expiresAt).toISOString() };
  }

  authenticate(request: IncomingMessage, mutation = false): DashboardSession {
    const token = cookie(request, COOKIE_NAME);
    const tokenHash = token ? hash(token) : undefined;
    const session = tokenHash ? this.sessions.get(tokenHash) : undefined;
    if (!session || session.expiresAt <= Date.now()) {
      if (token) this.sessions.delete(hash(token));
      throw new DashboardHttpError(401, 'Dashboard authentication required');
    }
    this.limitSession(tokenHash!, mutation ? 240 : 900);
    if (mutation) {
      const supplied = request.headers['x-csrf-token'];
      if (typeof supplied !== 'string' || !secureHashEquals(supplied, session.csrfHash)) throw new DashboardHttpError(403, 'CSRF validation failed');
    }
    return session;
  }

  session(request: IncomingMessage): { authenticated: true; csrfToken: string; expiresAt: string } {
    const session = this.authenticate(request);
    const csrfToken = randomBytes(32).toString('base64url');
    session.csrfHash = hash(csrfToken);
    return { authenticated: true, csrfToken, expiresAt: new Date(session.expiresAt).toISOString() };
  }

  logout(request: IncomingMessage, response: ServerResponse): void {
    this.authenticate(request, true);
    const token = cookie(request, COOKIE_NAME);
    if (token) {
      this.sessions.delete(hash(token));
      this.requestWindows.delete(hash(token));
    }
    response.setHeader('set-cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  }

  rememberApprovalToken(approvalId: string, token: string, expiresAt: string): void {
    this.approvalTokens.set(approvalId, { token, expiresAt: Date.parse(expiresAt) });
  }

  approvalToken(approvalId: string): string {
    const value = this.approvalTokens.get(approvalId);
    if (!value || value.expiresAt <= Date.now()) {
      this.approvalTokens.delete(approvalId);
      throw new DashboardHttpError(409, 'Approval expired or is unavailable; request a new review');
    }
    return value.token;
  }

  forgetApprovalToken(approvalId: string): void {
    this.approvalTokens.delete(approvalId);
  }

  verifyPairing(code: string): void {
    const supplied = createHash('sha256').update(code).digest();
    if (!timingSafeEqual(this.pairingHash, supplied)) throw new DashboardHttpError(401, 'Pairing code verification failed');
  }

  private limitLogin(): void {
    const now = Date.now();
    if (now - this.loginWindow.startedAt >= 60_000) this.loginWindow = { startedAt: now, count: 0 };
    this.loginWindow.count += 1;
    if (this.loginWindow.count > 30) throw new DashboardHttpError(429, 'Too many pairing attempts; wait one minute');
  }

  private limitSession(tokenHash: string, limit: number): void {
    const now = Date.now();
    const current = this.requestWindows.get(tokenHash);
    const window = !current || now - current.startedAt >= 60_000 ? { startedAt: now, count: 0 } : current;
    window.count += 1;
    this.requestWindows.set(tokenHash, window);
    if (window.count > limit) throw new DashboardHttpError(429, 'Dashboard request rate exceeded; retry shortly');
    if (this.requestWindows.size > 1_000) for (const [key, value] of this.requestWindows) if (now - value.startedAt > 60_000) this.requestWindows.delete(key);
  }
}

export class DashboardHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function handleDashboardRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  service: OrchestratorService,
  sessions: DashboardSessions,
  worker?: LocalWorkerClient
): Promise<boolean> {
  if (!url.pathname.startsWith('/v1/dashboard/')) return false;
  const correlationId = request.headers['x-correlation-id']?.toString().slice(0, 100) || randomUUID();
  response.setHeader('x-correlation-id', correlationId);
  try {
    if (url.pathname === '/v1/dashboard/session' && request.method === 'POST') {
      const body = await readBody(request);
      return send(response, 200, sessions.login(text(body.code, 'code', 256), response), correlationId);
    }
    if (url.pathname === '/v1/dashboard/session' && request.method === 'GET') {
      return send(response, 200, sessions.session(request), correlationId);
    }
    if (url.pathname === '/v1/dashboard/session' && request.method === 'DELETE') {
      sessions.logout(request, response);
      return send(response, 200, { authenticated: false }, correlationId);
    }

    const mutation = !['GET', 'HEAD'].includes(request.method ?? 'GET');
    sessions.authenticate(request, mutation);

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/summary') {
      const jobs = service.store.listJobs();
      const applications = service.store.listPreparedApplications();
      syncManualActions(service, applications);
      const dispositions = service.store.listJobDispositions();
      const approvals = service.store.listApprovalRequests('pending');
      const manualActions = service.store.listManualActions('open');
      const campaigns = service.store.listCampaigns();
      const scores = jobs.map((job) => job.matchScore);
      return send(response, 200, {
        generatedAt: new Date().toISOString(),
        health: {
          daemon: 'online',
          storage: 'ready',
          browser: String(service.jobs.browserStatus().status),
          emergencyStop: service.emergencyStop.active
        },
        counts: {
          jobs: jobs.length,
          shortlisted: [...dispositions.values()].filter((value) => value === 'shortlisted').length,
          applications: applications.length,
          approvals: approvals.length,
          manualActions: manualActions.length,
          campaigns: campaigns.length
        },
        queue: service.store.queue.health(),
        matchDistribution: [
          { label: '80–100', count: scores.filter((score) => score >= 80).length },
          { label: '60–79', count: scores.filter((score) => score >= 60 && score < 80).length },
          { label: '40–59', count: scores.filter((score) => score >= 40 && score < 60).length },
          { label: '0–39', count: scores.filter((score) => score < 40).length }
        ],
        campaignPulse: campaigns.slice(0, 5).map((campaign) => ({ id: campaign.id, name: campaign.name, state: campaign.state, updatedAt: campaign.updatedAt })),
        attention: [
          ...(service.emergencyStop.active ? [{ id: 'emergency-stop', kind: 'emergency_stop', title: 'Emergency stop is active', detail: 'All automated work is paused.' }] : []),
          ...approvals.slice(0, 5).map((approval) => ({ id: approval.id, kind: 'approval', title: 'Submission review required', detail: `Application ${approval.applicationId}` })),
          ...manualActions.slice(0, 5).map((item) => ({ id: item.id, kind: 'manual_action', title: item.title, detail: String(item.detail.state ?? item.kind) }))
        ]
      }, correlationId);
    }

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/jobs') {
      const all = dashboardJobs(service);
      const query = (url.searchParams.get('q') ?? '').trim().toLocaleLowerCase();
      const source = url.searchParams.get('source');
      const disposition = url.searchParams.get('disposition');
      const state = url.searchParams.get('state');
      const minScore = bounded(url.searchParams.get('minScore'), 0, 100, 0);
      const filtered = all.filter((job) =>
        (!query || `${job.title} ${job.employer} ${job.location} ${job.description}`.toLocaleLowerCase().includes(query)) &&
        (!source || job.source === source) &&
        (!disposition || job.disposition === disposition) &&
        (!state || job.applicationState === state) &&
        job.matchScore >= minScore
      );
      const sort = url.searchParams.get('sort') ?? 'newest';
      filtered.sort((left, right) => sort === 'score' ? right.matchScore - left.matchScore : String(right.discoveredAt ?? '').localeCompare(String(left.discoveredAt ?? '')));
      return send(response, 200, page(filtered, url), correlationId);
    }

    const jobMatch = url.pathname.match(/^\/v1\/dashboard\/jobs\/([^/]+)$/);
    if (request.method === 'GET' && jobMatch) {
      const job = dashboardJobs(service).find((item) => item.id === decode(jobMatch[1]));
      if (!job) throw new DashboardHttpError(404, 'Job not found');
      const connectorId = service.jobs.policies.connectorForHost(new URL(job.url).hostname);
      return send(response, 200, { ...job, connector: service.jobs.capabilities(connectorId) }, correlationId, etag(job));
    }

    const jobDecisionMatch = url.pathname.match(/^\/v1\/dashboard\/jobs\/([^/]+)\/(shortlist|reject)$/);
    if (request.method === 'POST' && jobDecisionMatch) {
      const jobId = decode(jobDecisionMatch[1]);
      if (!service.store.getJob(jobId)) throw new DashboardHttpError(404, 'Job not found');
      const disposition = jobDecisionMatch[2] === 'shortlist' ? 'shortlisted' : 'rejected';
      service.store.setJobDisposition(jobId, disposition);
      service.audit(correlationId, `job.${disposition}`, { jobId });
      return send(response, 200, { jobId, disposition }, correlationId);
    }

    if (request.method === 'POST' && url.pathname === '/v1/dashboard/jobs/bulk') {
      const body = await readBody(request);
      const ids = stringList(body.ids, 'ids', 100);
      const action = text(body.action, 'action', 40);
      for (const id of ids) if (!service.store.getJob(id)) throw new DashboardHttpError(404, `Job ${id} not found`);
      if (action === 'shortlist' || action === 'reject') {
        const disposition = action === 'shortlist' ? 'shortlisted' : 'rejected';
        for (const id of ids) service.store.setJobDisposition(id, disposition);
      } else if (action === 'tag') {
        service.store.addJobTags(ids, stringList(body.tags, 'tags', 20).map(cleanTag));
      } else {
        throw new DashboardHttpError(400, 'Only shortlist, reject, and tag are safe bulk actions');
      }
      service.audit(correlationId, 'jobs.bulk_updated', { ids, action });
      return send(response, 200, { updated: ids.length, action }, correlationId);
    }

    const jobNoteMatch = url.pathname.match(/^\/v1\/dashboard\/jobs\/([^/]+)\/note$/);
    if (request.method === 'PUT' && jobNoteMatch) {
      const body = await readBody(request);
      const version = service.store.setJobNote(decode(jobNoteMatch[1]), text(body.note, 'note', 5_000, true), optionalInteger(body.version));
      return send(response, 200, { version }, correlationId);
    }

    if (url.pathname === '/v1/dashboard/jobs/views' && request.method === 'GET') return send(response, 200, service.store.listJobViews(), correlationId);
    if (url.pathname === '/v1/dashboard/jobs/views' && request.method === 'POST') {
      const body = await readBody(request);
      return send(response, 201, service.store.saveJobView({
        ...(typeof body.id === 'string' ? { id: text(body.id, 'id', 100) } : {}),
        name: text(body.name, 'name', 100),
        query: record(body.query),
        ...(body.version === undefined ? {} : { expectedVersion: requiredVersion(body.version) })
      }), correlationId);
    }
    const viewMatch = url.pathname.match(/^\/v1\/dashboard\/jobs\/views\/([^/]+)$/);
    if (viewMatch && request.method === 'DELETE') return send(response, 200, { removed: service.store.removeJobView(decode(viewMatch[1])) }, correlationId);

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/applications') {
      const state = url.searchParams.get('state');
      const applications = dashboardApplications(service).filter((application) => !state || application.state === state);
      return send(response, 200, page(applications, url), correlationId);
    }
    const applicationMatch = url.pathname.match(/^\/v1\/dashboard\/applications\/([^/]+)$/);
    if (request.method === 'GET' && applicationMatch) {
      const application = service.store.getPreparedApplication(decode(applicationMatch[1]));
      if (!application) throw new DashboardHttpError(404, 'Application not found');
      return send(response, 200, publicApplication(application, true), correlationId, etag(application));
    }
    const timelineMatch = url.pathname.match(/^\/v1\/dashboard\/applications\/([^/]+)\/timeline$/);
    if (request.method === 'GET' && timelineMatch) {
      const applicationId = decode(timelineMatch[1]);
      return send(response, 200, {
        transitions: service.store.applicationEvents(applicationId).map((event) => ({ ...event, detail: sanitizeAuditDetail(event.detail) })),
        audit: service.store.applicationTimeline(applicationId).map(publicAudit)
      }, correlationId);
    }
    const prepareMatch = url.pathname.match(/^\/v1\/dashboard\/jobs\/([^/]+)\/prepare$/);
    if (request.method === 'POST' && prepareMatch) {
      const body = await readBody(request);
      const data = await service.jobs.prepareApplication({
        jobId: decode(prepareMatch[1]),
        ...(typeof body.profileId === 'string' ? { profileId: text(body.profileId, 'profileId', 100) } : {}),
        dryRun: body.dryRun !== false,
        idempotencyKey: text(body.idempotencyKey ?? randomUUID(), 'idempotencyKey', 128)
      });
      return send(response, 200, publicApplication(data), correlationId);
    }
    const requestApprovalMatch = url.pathname.match(/^\/v1\/dashboard\/applications\/([^/]+)\/request-approval$/);
    if (request.method === 'POST' && requestApprovalMatch) {
      const body = await readBody(request);
      const data = service.jobs.requestSubmissionApproval({
        applicationId: decode(requestApprovalMatch[1]),
        ttlSeconds: bounded(body.ttlSeconds, 30, 300, 120),
        idempotencyKey: text(body.idempotencyKey ?? randomUUID(), 'idempotencyKey', 128)
      });
      return send(response, 200, withoutApprovalSecrets(data), correlationId);
    }
    const fillMatch = url.pathname.match(/^\/v1\/dashboard\/applications\/([^/]+)\/fill$/);
    if (request.method === 'POST' && fillMatch) {
      const body = await readBody(request);
      const overrides = Array.isArray(body.approvedAnswerOverrides)
        ? body.approvedAnswerOverrides.map((value) => {
            const item = record(value);
            return {
              ...(typeof item.fieldId === 'string' ? { fieldId: text(item.fieldId, 'fieldId', 200) } : {}),
              ...(typeof item.label === 'string' ? { label: text(item.label, 'label', 500) } : {}),
              value: text(item.value, 'value', 5_000, true),
              approved: true as const
            };
          })
        : undefined;
      const data = await service.jobs.fillApplication({
        applicationId: decode(fillMatch[1]),
        ...(overrides ? { approvedAnswerOverrides: overrides } : {}),
        dryRun: body.dryRun !== false,
        idempotencyKey: text(body.idempotencyKey ?? randomUUID(), 'idempotencyKey', 128)
      });
      return send(response, 200, publicApplication(data, true), correlationId);
    }

    if (request.method === 'POST' && url.pathname === '/v1/dashboard/resumes/import') {
      const body = await readBody(request);
      const sourceName = text(body.sourceName, 'sourceName', 200);
      const encoded = text(body.base64, 'base64', 5_800_000);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new DashboardHttpError(400, 'Invalid base64 resume');
      const bytes = Buffer.from(encoded, 'base64');
      const vault = new ArtifactStore(resolve(process.env.DATA_DIR ?? './data', 'vault'));
      const imported = await new ResumeVault(vault, 5 * 1024 * 1024).importBytes(typeof body.profileId === 'string' ? text(body.profileId, 'profileId', 100) : 'default', sourceName, bytes);
      try { service.store.saveRegisteredResume(imported.source, imported.sourceArtifactId, imported.profile); } catch (error) { vault.remove(imported.sourceArtifactId); throw error; }
      service.audit(correlationId, 'resume.source_imported', { resumeSourceId: imported.source.id, mediaType: imported.source.mediaType, size: imported.source.size, factCount: imported.profile.facts.length });
      return send(response, 201, { source: imported.source, facts: imported.profile.facts }, correlationId);
    }
    if (request.method === 'GET' && url.pathname === '/v1/dashboard/resumes') {
      return send(response, 200, {
        sources: service.store.listRegisteredResumes().map((item) => ({ source: item.source, facts: item.profile.facts })),
        tailored: service.store.listTailoredResumes().map(publicTailoredResume)
      }, correlationId);
    }
    const resumeMatch = url.pathname.match(/^\/v1\/dashboard\/resumes\/([^/]+)$/);
    if (request.method === 'GET' && resumeMatch) {
      const resume = service.store.getRegisteredResume(decode(resumeMatch[1]));
      if (!resume) throw new DashboardHttpError(404, 'Resume not found');
      return send(response, 200, { source: resume.source, facts: resume.profile.facts }, correlationId, etag(resume.source));
    }
    const resumeApproveMatch = url.pathname.match(/^\/v1\/dashboard\/resumes\/([^/]+)\/approve$/);
    if (request.method === 'POST' && resumeApproveMatch) {
      const approved = service.store.approveRegisteredResume(decode(resumeApproveMatch[1]));
      if (!approved) throw new DashboardHttpError(404, 'Resume not found');
      service.audit(correlationId, 'resume.source_approved', { resumeSourceId: approved.source.id, snapshotId: approved.snapshotId });
      return send(response, 200, { source: approved.source, facts: approved.profile.facts, snapshotId: approved.snapshotId }, correlationId);
    }
    const tailorMatch = url.pathname.match(/^\/v1\/dashboard\/jobs\/([^/]+)\/tailor$/);
    if (request.method === 'POST' && tailorMatch) {
      const body = await readBody(request);
      const resumeId = text(body.resumeId, 'resumeId', 100);
      const idempotencyKey = text(body.idempotencyKey ?? randomUUID(), 'idempotencyKey', 128);
      const data = await idempotent(service, 'dashboard.resume.tailor', idempotencyKey, { resumeId, jobId: tailorMatch[1] }, async () => {
        const resume = service.store.getRegisteredResume(resumeId);
        const snapshot = service.store.canonicalProfileSnapshot(resumeId);
        if (!resume?.source.approved || !snapshot) throw new DashboardHttpError(409, 'Resume must be approved before tailoring');
        const legacy = service.store.getJob(decode(tailorMatch[1]));
        if (!legacy) throw new DashboardHttpError(404, 'Job not found');
        const connectorId = service.jobs.policies.connectorForHost(new URL(legacy.url).hostname);
        const job: NormalizedJob = {
          id: legacy.id, fingerprint: legacy.fingerprint, title: legacy.title, employer: legacy.employer,
          location: legacy.location, description: legacy.description, url: legacy.url,
          source: { connectorId, externalId: legacy.sourceId, discoveredAt: legacy.discoveredAt ?? new Date().toISOString(), discoveryMode: service.jobs.policies.get(connectorId).capabilities.discovery },
          applicationDestination: service.jobs.destinations.detect(legacy.url).destination,
          requiredSkills: legacy.requiredSkills ?? [], preferredSkills: legacy.preferredSkills ?? [],
          remote: legacy.remote ?? false, matchScore: legacy.matchScore
        };
        const result = tailorResume({ sourceResumeId: resumeId, profileSnapshotId: snapshot.id, profile: snapshot.profile, job });
        service.store.saveTailoredResume(result);
        let saved: TailoredResumeRecord = result;
        if (worker) {
          const rendered = await worker.execute<{ artifacts: { json: Artifact; html: Artifact; pdf: Artifact; diff: Artifact; validation: Artifact } }>('resume.render', 'renderResume', { document: result.document, review: result.review, validation: result.validation });
          saved = service.store.attachTailoredResumeArtifacts(result.tailoredResume.id, rendered.artifacts) ?? result;
        }
        service.audit(correlationId, 'resume.tailoring_review_created', { tailoredResumeId: result.tailoredResume.id, jobId: job.id, resumeId, valid: result.validation.valid, rendered: Boolean(worker) });
        return publicTailoredResume(saved);
      });
      return send(response, 201, data, correlationId);
    }
    const tailoredApproveMatch = url.pathname.match(/^\/v1\/dashboard\/tailored-resumes\/([^/]+)\/(approve|reject)$/);
    if (request.method === 'POST' && tailoredApproveMatch) {
      const id = decode(tailoredApproveMatch[1]);
      if (tailoredApproveMatch[2] === 'approve') {
        if (!service.store.approveTailoredResume(id)) throw new DashboardHttpError(404, 'Tailored resume not found');
        service.audit(correlationId, 'resume.tailored_approved', { tailoredResumeId: id });
        return send(response, 200, { id, approved: true }, correlationId);
      }
      const value = service.store.getTailoredResume(id);
      if (!value) throw new DashboardHttpError(404, 'Tailored resume not found');
      service.audit(correlationId, 'resume.tailored_rejected', { tailoredResumeId: id });
      return send(response, 200, { id, approved: false, rejected: true }, correlationId);
    }
    const artifactMatch = url.pathname.match(/^\/v1\/dashboard\/artifacts\/([^/]+)\/content$/);
    if (request.method === 'GET' && artifactMatch) {
      const value = service.store.getArtifactContent(decode(artifactMatch[1]));
      if (!value || value.artifact.kind !== 'resume-pdf') throw new DashboardHttpError(404, 'PDF artifact not found');
      response.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': value.content.length,
        'content-disposition': 'inline',
        'cache-control': 'private, no-store',
        'x-correlation-id': correlationId
      });
      response.end(value.content);
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/approvals') {
      const status = url.searchParams.get('status');
      const values = service.store.listApprovalRequests(status && status !== 'all' ? status as never : undefined).map(withoutApprovalSecrets);
      return send(response, 200, page(values, url), correlationId);
    }
    const decisionMatch = url.pathname.match(/^\/v1\/dashboard\/approvals\/([^/]+)\/decision$/);
    if (request.method === 'POST' && decisionMatch) {
      const body = await readBody(request);
      if (typeof body.approved !== 'boolean') throw new DashboardHttpError(400, 'approved must be a boolean');
      const id = decode(decisionMatch[1]);
      const decided = service.jobs.decideApplicationApproval(id, body.approved);
      const approvalToken = typeof decided === 'object' && decided && 'approvalToken' in decided ? String(decided.approvalToken) : undefined;
      const expiresAt = typeof decided === 'object' && decided && 'expiresAt' in decided ? String(decided.expiresAt) : new Date(Date.now() + 120_000).toISOString();
      if (approvalToken) sessions.rememberApprovalToken(id, approvalToken, expiresAt);
      return send(response, 200, withoutApprovalSecrets(decided), correlationId);
    }
    const submitMatch = url.pathname.match(/^\/v1\/dashboard\/approvals\/([^/]+)\/submit$/);
    if (request.method === 'POST' && submitMatch) {
      const body = await readBody(request);
      const approvalId = decode(submitMatch[1]);
      const approval = service.store.getApprovalRequest(approvalId);
      if (!approval) throw new DashboardHttpError(404, 'Approval not found');
      const result = await service.jobs.submitApplication({
        applicationId: approval.applicationId,
        approvalRequestId: approvalId,
        approvalToken: sessions.approvalToken(approvalId),
        idempotencyKey: text(body.idempotencyKey ?? randomUUID(), 'idempotencyKey', 128)
      });
      sessions.forgetApprovalToken(approvalId);
      return send(response, 200, result, correlationId);
    }

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/campaigns') return send(response, 200, service.store.listCampaigns(), correlationId);
    if (request.method === 'POST' && url.pathname === '/v1/dashboard/campaigns/preview') {
      const body = await readBody(request);
      const preview = campaignFrom(body, false);
      return send(response, 200, { campaign: preview, safeguards: campaignSafeguards(preview) }, correlationId);
    }
    if (request.method === 'POST' && url.pathname === '/v1/dashboard/campaigns') {
      const campaign = campaignFrom(await readBody(request), true);
      if (!service.store.getProfile(campaign.profileId) && !service.store.registeredCandidateProfile(campaign.profileId)) throw new DashboardHttpError(409, 'Campaign requires an approved profile');
      return send(response, 201, service.createCampaign(campaign), correlationId);
    }
    const campaignMatch = url.pathname.match(/^\/v1\/dashboard\/campaigns\/([^/]+)$/);
    if (request.method === 'PATCH' && campaignMatch) {
      const existing = service.store.getCampaign(decode(campaignMatch[1]));
      if (!existing) throw new DashboardHttpError(404, 'Campaign not found');
      const body = await readBody(request);
      const updated = campaignFrom({ ...existing, ...body, id: existing.id, createdAt: existing.createdAt }, true);
      service.store.saveCampaign(updated);
      service.audit(correlationId, 'campaign.updated', { campaignId: existing.id });
      return send(response, 200, updated, correlationId);
    }
    const campaignActionMatch = url.pathname.match(/^\/v1\/dashboard\/campaigns\/([^/]+)\/(run|pause|resume)$/);
    if (request.method === 'POST' && campaignActionMatch) {
      const campaign = service.store.getCampaign(decode(campaignActionMatch[1]));
      if (!campaign) throw new DashboardHttpError(404, 'Campaign not found');
      const action = campaignActionMatch[2];
      if (action === 'run') {
        if (campaign.state === 'paused') throw new DashboardHttpError(409, 'Campaign is paused');
        return send(response, 200, await service.runCampaign(campaign), correlationId);
      }
      const updated: JobCampaign = { ...campaign, state: action === 'pause' ? 'paused' : 'enabled', updatedAt: new Date().toISOString() };
      service.store.saveCampaign(updated);
      service.audit(correlationId, `campaign.${action}`, { campaignId: campaign.id });
      return send(response, 200, updated, correlationId);
    }

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/connectors') return send(response, 200, service.jobs.capabilities(), correlationId);
    const connectorMatch = url.pathname.match(/^\/v1\/dashboard\/connectors\/([^/]+)$/);
    if (request.method === 'GET' && connectorMatch) return send(response, 200, service.jobs.capabilities(connectorId(connectorMatch[1])), correlationId);
    const connectorActionMatch = url.pathname.match(/^\/v1\/dashboard\/connectors\/([^/]+)\/(enable|disable)$/);
    if (request.method === 'POST' && connectorActionMatch) {
      const result = service.jobs.configureConnector(connectorId(connectorActionMatch[1]), connectorActionMatch[2] === 'enable');
      service.audit(correlationId, `connector.${connectorActionMatch[2]}d`, { connectorId: connectorActionMatch[1] });
      return send(response, 200, result, correlationId);
    }

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/manual-actions') {
      syncManualActions(service, service.store.listPreparedApplications());
      return send(response, 200, page(service.store.listManualActions(url.searchParams.get('status') as never || undefined), url), correlationId);
    }
    const manualActionMatch = url.pathname.match(/^\/v1\/dashboard\/manual-actions\/([^/]+)\/(continue|cancel)$/);
    if (request.method === 'POST' && manualActionMatch) {
      const item = service.store.updateManualAction(decode(manualActionMatch[1]), manualActionMatch[2] === 'continue' ? 'continued' : 'cancelled');
      if (!item) throw new DashboardHttpError(404, 'Manual action not found');
      if (manualActionMatch[2] === 'cancel' && item.applicationId) await service.jobs.cancelApplication({ applicationId: item.applicationId, idempotencyKey: randomUUID() });
      return send(response, 200, item, correlationId);
    }

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/activity') {
      const type = url.searchParams.get('type');
      const activity = service.store.timeline().map(publicAudit).filter((event) => !type || event.type === type);
      return send(response, 200, page(activity, url), correlationId);
    }
    if (request.method === 'GET' && url.pathname === '/v1/dashboard/analytics') {
      const jobs = service.store.listJobs();
      const applications = service.store.listPreparedApplications();
      return send(response, 200, {
        funnel: [
          { label: 'Discovered', value: jobs.length },
          { label: 'Shortlisted', value: [...service.store.listJobDispositions().values()].filter((value) => value === 'shortlisted').length },
          { label: 'Applications', value: applications.length },
          { label: 'Submitted', value: applications.filter((value) => value.state === 'SUBMITTED').length }
        ],
        sourcePerformance: Object.entries(groupBy(jobs, (job) => job.source)).map(([source, values]) => ({
          source,
          jobs: values.length,
          averageScore: Math.round(values.reduce((sum, job) => sum + job.matchScore, 0) / values.length)
        }))
      }, correlationId);
    }

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/preferences') {
      return send(response, 200, service.store.getDashboardPreference('ui') ?? { key: 'ui', data: {}, version: 0 }, correlationId);
    }
    if (request.method === 'PUT' && url.pathname === '/v1/dashboard/preferences') {
      const body = await readBody(request);
      return send(response, 200, service.store.saveDashboardPreference('ui', record(body.data), optionalInteger(body.version)), correlationId);
    }
    if (request.method === 'POST' && url.pathname === '/v1/dashboard/emergency-stop') {
      service.emergencyStop.engage();
      const cancelledJobs = service.store.queue.requestCancellationAll('dashboard-emergency-stop');
      service.audit(correlationId, 'emergency_stop.engaged', { cancelledJobs });
      return send(response, 200, { stopped: true, cancelledJobs }, correlationId);
    }
    if (request.method === 'POST' && url.pathname === '/v1/dashboard/emergency-stop/reset') {
      service.emergencyStop.reset();
      service.audit(correlationId, 'emergency_stop.reset', {});
      return send(response, 200, { stopped: false }, correlationId);
    }

    if (request.method === 'POST' && url.pathname === '/v1/dashboard/chat') {
      const body = await readBody(request);
      const stream = service.chat(
        text(body.text, 'text', 8_000),
        typeof body.profileId === 'string' ? text(body.profileId, 'profileId', 100) : undefined
      )[Symbol.asyncIterator]();
      let first: IteratorResult<string>;
      try {
        first = await stream.next();
      } catch {
        throw new DashboardHttpError(503, 'OpenClaw assistant is unavailable; check the local gateway and try again');
      }
      response.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-correlation-id': correlationId });
      try {
        if (!first.done) response.write(`${JSON.stringify({ type: 'chunk', text: first.value })}\n`);
        while (true) {
          const result = await stream.next();
          if (result.done) break;
          response.write(`${JSON.stringify({ type: 'chunk', text: result.value })}\n`);
        }
        response.end(`${JSON.stringify({ type: 'done' })}\n`);
      } catch {
        response.end(`${JSON.stringify({ type: 'error', error: 'OpenClaw assistant disconnected; try again', correlationId })}\n`);
      }
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/v1/dashboard/events') {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-correlation-id': correlationId
      });
      response.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
      const interval = setInterval(() => response.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString(), emergencyStop: service.emergencyStop.active, queue: service.store.queue.health() })}\n\n`), 15_000);
      const lifetime = setTimeout(() => response.end(), 55_000);
      const close = () => { clearInterval(interval); clearTimeout(lifetime); };
      request.once('close', close);
      response.once('close', close);
      return true;
    }

    throw new DashboardHttpError(404, 'Dashboard endpoint not found');
  } catch (error) {
    const status = error instanceof DashboardHttpError ? error.status : error instanceof WuzzufToolError ? error.status : error instanceof Error && error.message === 'VERSION_CONFLICT' ? 412 : 500;
    const detail = error instanceof WuzzufToolError ? { code: error.code, retryable: error.retryable, ...(error.actionRequired ? { actionRequired: error.actionRequired } : {}) } : {};
    send(response, status, { error: status === 500 ? 'Internal server error' : error instanceof Error ? error.message : 'Request failed', ...detail }, correlationId);
    return true;
  }
}

function dashboardJobs(service: OrchestratorService) {
  const applications = new Map(service.store.listPreparedApplications().map((application) => [application.jobId, application]));
  const dispositions = service.store.listJobDispositions();
  return service.store.listJobs().map((job) => {
    const application = applications.get(job.id);
    const note = service.store.getJobNote(job.id);
    return {
      ...job,
      remote: job.remote ?? false,
      discoveredAt: job.discoveredAt,
      disposition: dispositions.get(job.id),
      tags: service.store.jobTags(job.id),
      ...(note ? { note: note.note, noteVersion: note.version } : {}),
      ...(application ? { applicationState: application.state, applicationId: application.id } : {})
    };
  });
}

function dashboardApplications(service: OrchestratorService) {
  return service.store.listPreparedApplications().map((application) => publicApplication(application));
}

function publicApplication(application: PreparedApplicationRecord, includeAnswerValues = false) {
  return {
    id: application.id ?? '',
    jobId: application.jobId ?? '',
    state: application.state ?? 'UNKNOWN',
    createdAt: application.createdAt ?? new Date().toISOString(),
    updatedAt: application.updatedAt ?? new Date().toISOString(),
    dryRun: application.dryRun ?? true,
    job: application.job ? { title: application.job.title, employer: application.job.employer, location: application.job.location } : undefined,
    answers: (application.answers ?? []).map((answer) => ({ ...answer, value: includeAnswerValues ? answer.value : answer.confirmationRequired ? '' : answer.value })),
    filledFields: application.filledFields ?? [],
    skippedFields: application.skippedFields ?? [],
    validationErrors: application.validationErrors ?? [],
    sensitiveFields: application.sensitiveFields ?? [],
    submissionAllowed: application.submissionAllowed ?? false,
    lastSuccessfulStep: application.lastSuccessfulStep,
    errors: application.errors ?? [],
    submittedAt: application.submittedAt
  };
}

function publicTailoredResume(value: TailoredResumeRecord) {
  return {
    tailoredResume: value.tailoredResume,
    review: value.review,
    validation: value.validation,
    artifacts: value.artifacts
  };
}

function publicAudit(event: ReturnType<OrchestratorService['store']['timeline']>[number]) {
  return { ...event, detail: sanitizeAuditDetail(event.detail) };
}

function syncManualActions(service: OrchestratorService, applications: ReturnType<OrchestratorService['store']['listPreparedApplications']>): void {
  const existing = new Set(service.store.listManualActions().map((item) => item.id));
  for (const application of applications) {
    if (!application.id || !application.state || !MANUAL_STATES.has(application.state)) continue;
    const id = `application:${application.id}:${application.state}`;
    if (existing.has(id)) continue;
    service.store.saveManualAction({
      id,
      applicationId: application.id,
      kind: application.state.toLocaleLowerCase(),
      status: 'open',
      title: manualTitle(application.state),
      detail: { state: application.state, jobId: application.jobId ?? '' }
    });
  }
}

function campaignFrom(body: Record<string, unknown>, persisted: boolean): JobCampaign {
  const now = new Date().toISOString();
  const executionMode = text(body.executionMode ?? 'prepare_and_review', 'executionMode', 40);
  if (!['research_only', 'prepare_and_review', 'auto_submit'].includes(executionMode)) throw new DashboardHttpError(400, 'Invalid execution mode');
  const campaign: JobCampaign = {
    id: typeof body.id === 'string' ? text(body.id, 'id', 100) : randomUUID(),
    name: text(body.name, 'name', 100),
    state: body.state === 'paused' ? 'paused' : 'enabled',
    searchQueries: stringList(body.searchQueries, 'searchQueries', 10),
    locations: stringList(body.locations, 'locations', 10),
    workplace: Array.isArray(body.workplace) && body.workplace.length ? body.workplace.filter((item): item is 'remote' | 'hybrid' | 'onsite' => ['remote', 'hybrid', 'onsite'].includes(String(item))) : ['remote'],
    includedKeywords: stringList(body.includedKeywords ?? [], 'includedKeywords', 20),
    excludedKeywords: stringList(body.excludedKeywords ?? [], 'excludedKeywords', 20),
    seniority: stringList(body.seniority ?? [], 'seniority', 20),
    minimumMatchScore: bounded(body.minimumMatchScore, 0, 100, 70),
    allowedSites: stringList(body.allowedSites ?? ['development'], 'allowedSites', 20),
    maxApplicationsPerRun: bounded(body.maxApplicationsPerRun, 1, 100, 10),
    maxApplicationsPerDay: bounded(body.maxApplicationsPerDay, 1, 200, 20),
    timezone: timezone(text(body.timezone ?? 'Africa/Cairo', 'timezone', 100)),
    executionMode: executionMode as JobCampaign['executionMode'],
    profileId: text(body.profileId, 'profileId', 100),
    cvStrategy: text(body.cvStrategy ?? 'selected', 'cvStrategy', 100),
    providerId: text(body.providerId ?? 'openclaw', 'providerId', 100),
    model: text(body.model ?? 'default', 'model', 200),
    dryRun: body.dryRun !== false,
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : now,
    updatedAt: now
  };
  if (persisted && campaign.executionMode === 'auto_submit') campaign.executionMode = 'prepare_and_review';
  return campaign;
}

function campaignSafeguards(campaign: JobCampaign) {
  return {
    dryRun: campaign.dryRun,
    humanSubmissionApproval: true,
    applicationsPerRun: campaign.maxApplicationsPerRun,
    applicationsPerDay: campaign.maxApplicationsPerDay,
    effectiveExecutionMode: campaign.executionMode === 'auto_submit' ? 'prepare_and_review' : campaign.executionMode
  };
}

function withoutApprovalSecrets<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const clone = { ...(value as Record<string, unknown>) };
  delete clone.approvalToken;
  delete clone.nonceHash;
  delete clone.bindingHash;
  return clone as T;
}

async function idempotent<T>(service: OrchestratorService, operation: string, key: string, input: unknown, run: () => Promise<T>): Promise<T> {
  const requestHash = hash(JSON.stringify(input));
  const current = service.store.beginIdempotent(operation, key, requestHash);
  if (current === 'conflict') throw new DashboardHttpError(409, 'Idempotency key was already used with different input');
  if (current !== 'started') {
    if (current.status === 'succeeded') return current.response as T;
    throw new DashboardHttpError(409, 'Operation is already running or needs review');
  }
  try {
    const value = await run();
    service.store.finishIdempotent(operation, key, 'succeeded', value);
    return value;
  } catch (error) {
    service.store.clearIdempotent(operation, key);
    throw error;
  }
}

function page<T>(items: T[], url: URL): { items: T[]; nextCursor?: string; total: number } {
  const limit = bounded(url.searchParams.get('limit'), 1, 100, 25);
  const offset = cursorOffset(url.searchParams.get('cursor'));
  const values = items.slice(offset, offset + limit);
  const next = offset + values.length;
  return { items: values, ...(next < items.length ? { nextCursor: Buffer.from(String(next)).toString('base64url') } : {}), total: items.length };
}

function cursorOffset(value: string | null): number {
  if (!value) return 0;
  const offset = Number(Buffer.from(value, 'base64url').toString('utf8'));
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) throw new DashboardHttpError(400, 'Invalid cursor');
  return offset;
}

function groupBy<T>(values: T[], key: (value: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const value of values) (result[key(value)] ??= []).push(value);
  return result;
}

function manualTitle(state: string): string {
  if (state.includes('AUTH')) return 'Sign in required';
  if (state.includes('SECURITY')) return 'Security challenge needs attention';
  if (state === 'FORM_CHANGED') return 'Application form changed';
  if (state === 'POLICY_BLOCKED') return 'Connector policy blocked this application';
  return 'Application needs manual review';
}

function cleanTag(value: string): string {
  const tag = value.trim().toLocaleLowerCase().replace(/[^a-z0-9 _-]/g, '').slice(0, 40);
  if (!tag) throw new DashboardHttpError(400, 'Invalid tag');
  return tag;
}

function cookie(request: IncomingMessage, name: string): string | undefined {
  const values = (request.headers.cookie ?? '').split(';').map((part) => part.trim().split('='));
  return values.find(([key]) => key === name)?.slice(1).join('=');
}

function secureHashEquals(value: string, expectedHash: string): boolean {
  const actual = createHash('sha256').update(value).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function decode(value: string | undefined): string {
  if (!value) throw new DashboardHttpError(400, 'Missing resource identifier');
  try { return decodeURIComponent(value); } catch { throw new DashboardHttpError(400, 'Invalid resource identifier'); }
}

function connectorId(value: string | undefined): ConnectorId {
  const id = decode(value) as ConnectorId;
  if (!connectorIds.includes(id)) throw new DashboardHttpError(404, 'Unknown connector');
  return id;
}

function timezone(value: string): string {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return value; } catch { throw new DashboardHttpError(400, 'Invalid timezone'); }
}

function etag(value: unknown): string {
  return `"${createHash('sha256').update(JSON.stringify(value)).digest('base64url')}"`;
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new DashboardHttpError(413, 'Request too large');
    chunks.push(buffer);
  }
  try { return record(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { throw new DashboardHttpError(400, 'Invalid JSON body'); }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DashboardHttpError(400, 'Expected an object');
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) throw new DashboardHttpError(400, `Invalid ${field}`);
  return value.trim();
}

function stringList(value: unknown, field: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 300)) throw new DashboardHttpError(400, `Invalid ${field}`);
  return value.map((item) => String(item).trim());
}

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  const number = value === null || value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new DashboardHttpError(400, 'Numeric value is out of range');
  return number;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new DashboardHttpError(400, 'Invalid version');
  return number;
}

function requiredVersion(value: unknown): number {
  const version = optionalInteger(value);
  if (version === undefined) throw new DashboardHttpError(400, 'Invalid version');
  return version;
}

function send(response: ServerResponse, status: number, data: unknown, correlationId: string, entityTag?: string): true {
  if (response.headersSent) return true;
  const body = JSON.stringify({ ok: status < 400, ...(status < 400 ? { data } : data as Record<string, unknown>), correlationId });
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-correlation-id': correlationId,
    ...(entityTag ? { etag: entityTag } : {})
  });
  response.end(body);
  return true;
}
