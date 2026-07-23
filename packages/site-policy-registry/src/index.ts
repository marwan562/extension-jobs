import type { ConnectorCapabilities, ConnectorId, SitePolicy } from '../../shared-contracts/src/index.ts';

const assisted = (submit: ConnectorCapabilities['submit'] = 'manual'): ConnectorCapabilities => ({
  discovery: 'user_triggered', details: 'user_triggered', fill: 'assisted', submit,
  requiresUserPresence: true, requiresSubmissionApproval: true
});

const policies = [
  { connectorId: 'wuzzuf', version: '2026-07-22.1', enabledByDefault: true, allowedHosts: ['wuzzuf.net'], capabilities: { discovery: 'browser_automated', details: 'browser_automated', fill: 'automated', submit: 'browser_approved', requiresUserPresence: true, requiresSubmissionApproval: true }, notes: 'Controlled CDP implementation; challenges stop automation.' },
  { connectorId: 'indeed', version: '2026-07-22.1', enabledByDefault: true, allowedHosts: ['indeed.com'], capabilities: assisted(), notes: 'Current-page analysis and destination routing only.' },
  { connectorId: 'linkedin', version: '2026-07-22.1', enabledByDefault: true, allowedHosts: ['linkedin.com'], capabilities: assisted(), notes: 'Configured native discovery or current-page assistance; no placeholder submission.' },
  { connectorId: 'bayt', version: '2026-07-22.1', enabledByDefault: true, allowedHosts: ['bayt.com'], capabilities: assisted(), notes: 'Current-page assistance and destination routing.' },
  { connectorId: 'glassdoor', version: '2026-07-22.1', enabledByDefault: true, allowedHosts: ['glassdoor.com'], capabilities: assisted(), notes: 'Current-page assistance and destination routing.' },
  { connectorId: 'ziprecruiter', version: '2026-07-22.1', enabledByDefault: false, allowedHosts: ['ziprecruiter.com'], capabilities: { ...assisted(), discovery: 'official_api' }, notes: 'Official discovery only when explicitly configured.' },
  ...(['greenhouse', 'lever', 'ashby'] as const).map((connectorId) => ({ connectorId, version: '2026-07-22.1', enabledByDefault: true, allowedHosts: connectorId === 'greenhouse' ? ['greenhouse.io', 'boards.greenhouse.io'] : connectorId === 'lever' ? ['lever.co', 'jobs.lever.co'] : ['ashbyhq.com', 'jobs.ashbyhq.com'], capabilities: { discovery: 'official_api' as const, details: 'official_api' as const, fill: 'assisted' as const, submit: 'browser_approved' as const, requiresUserPresence: true, requiresSubmissionApproval: true }, notes: 'Public metadata plus reviewed browser-assisted forms.' })),
  ...(['workable', 'smartrecruiters', 'workday'] as const).map((connectorId) => ({ connectorId, version: '2026-07-22.1', enabledByDefault: true, allowedHosts: connectorId === 'workable' ? ['workable.com', 'apply.workable.com'] : connectorId === 'smartrecruiters' ? ['smartrecruiters.com', 'jobs.smartrecruiters.com'] : ['myworkdayjobs.com'], capabilities: assisted('browser_approved'), notes: 'Reviewed browser-assisted destination; unknown layouts fail closed.' })),
  { connectorId: 'employer-site', version: '2026-07-22.1', enabledByDefault: false, allowedHosts: [], capabilities: { discovery: 'unsupported', details: 'user_triggered', fill: 'manual', submit: 'manual', requiresUserPresence: true, requiresSubmissionApproval: true }, notes: 'Manual completion unless a reviewed adapter is added.' },
  { connectorId: 'email', version: '2026-07-22.1', enabledByDefault: false, allowedHosts: [], capabilities: { discovery: 'unsupported', details: 'unsupported', fill: 'manual', submit: 'manual', requiresUserPresence: true, requiresSubmissionApproval: true }, notes: 'Manual email application.' },
  { connectorId: 'unsupported', version: '2026-07-22.1', enabledByDefault: false, allowedHosts: [], capabilities: { discovery: 'unsupported', details: 'unsupported', fill: 'unsupported', submit: 'unsupported', requiresUserPresence: true, requiresSubmissionApproval: true }, notes: 'Fail-closed fallback.' },
  { connectorId: 'development', version: '2026-07-22.1', enabledByDefault: false, allowedHosts: ['127.0.0.1', 'localhost'], capabilities: { discovery: 'browser_automated', details: 'browser_automated', fill: 'automated', submit: 'browser_approved', requiresUserPresence: false, requiresSubmissionApproval: true }, notes: 'Fixture mode only.' }
] satisfies SitePolicy[];

const byId = new Map<ConnectorId, SitePolicy>(policies.map((policy) => [policy.connectorId, Object.freeze(policy)]));

export class SitePolicyRegistry {
  private readonly enabled: Set<ConnectorId>;
  constructor(enabled?: Iterable<ConnectorId>) { this.enabled = new Set(enabled ?? policies.filter((policy) => policy.enabledByDefault).map((policy) => policy.connectorId)); }
  list(): SitePolicy[] { return policies.map((policy) => structuredClone(policy)); }
  get(id: ConnectorId): SitePolicy { return structuredClone(byId.get(id) ?? byId.get('unsupported')!); }
  isEnabled(id: ConnectorId): boolean { return this.enabled.has(id) && id !== 'unsupported'; }
  enable(id: ConnectorId): void { if (!byId.has(id) || id === 'unsupported') throw new Error('CONNECTOR_DISABLED'); this.enabled.add(id); }
  disable(id: ConnectorId): void { this.enabled.delete(id); }
  assertCapability(id: ConnectorId, operation: 'discovery' | 'details' | 'fill' | 'submit'): SitePolicy {
    const policy = this.get(id);
    if (!this.isEnabled(id)) throw new PolicyError('CONNECTOR_DISABLED', `${id} is not enabled`);
    const capability = policy.capabilities[operation];
    if (capability === 'unsupported') throw new PolicyError('AUTOMATION_NOT_PERMITTED', `${operation} is not supported for ${id}`);
    if (operation === 'submit' && capability === 'manual') throw new PolicyError('AUTOMATION_NOT_PERMITTED', `${id} requires manual submission`);
    return policy;
  }
  connectorForHost(hostname: string): ConnectorId {
    const host = hostname.toLowerCase().replace(/^www\./, '');
    return policies.find((policy) => policy.allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)))?.connectorId ?? 'unsupported';
  }
}

export class PolicyError extends Error {
  readonly code: 'CONNECTOR_DISABLED' | 'AUTOMATION_NOT_PERMITTED';
  constructor(code: 'CONNECTOR_DISABLED' | 'AUTOMATION_NOT_PERMITTED', message: string) { super(message); this.code = code; }
}

export const defaultSitePolicyRegistry = new SitePolicyRegistry();
