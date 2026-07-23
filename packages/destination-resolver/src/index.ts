import { createHash, randomUUID } from 'node:crypto';
import { load } from 'cheerio';
import type { ApplicationDestination, ConnectorId, NormalizedJob } from '../../shared-contracts/src/index.ts';
import { SitePolicyRegistry, defaultSitePolicyRegistry } from '../../site-policy-registry/src/index.ts';

export interface PageMetadata { title?: string; canonicalUrl?: string; jsonLd?: unknown; applicationUrl?: string }
export interface DestinationDetection { destination: ApplicationDestination; policyVersion: string }

export class DestinationResolver {
  private readonly policies: SitePolicyRegistry;
  constructor(policies: SitePolicyRegistry = defaultSitePolicyRegistry) { this.policies = policies; }
  detect(value: string | URL, metadata: PageMetadata = {}): DestinationDetection {
    const source = value instanceof URL ? value : new URL(value);
    if (!['https:', 'http:'].includes(source.protocol) || source.username || source.password) throw new Error('AUTOMATION_NOT_PERMITTED');
    const candidate = metadata.applicationUrl ? new URL(metadata.applicationUrl, source) : source;
    if (!['https:', 'http:'].includes(candidate.protocol) || candidate.username || candidate.password) throw new Error('AUTOMATION_NOT_PERMITTED');
    const adapterId = this.policies.connectorForHost(candidate.hostname);
    const policy = this.policies.get(adapterId);
    const supported = adapterId !== 'unsupported' && policy.capabilities.fill !== 'unsupported';
    return { destination: { adapterId, url: candidate.href, detectedAt: new Date().toISOString(), confidence: metadata.applicationUrl ? 0.98 : adapterId === 'unsupported' ? 0 : 0.9, supported }, policyVersion: policy.version };
  }
}

export interface CurrentPageInput { url: string; title?: string; jsonLd?: unknown; safeMetadata?: Record<string, string | string[] | boolean | undefined> }

export function importCurrentPage(input: CurrentPageInput, resolver = new DestinationResolver(), policies = defaultSitePolicyRegistry): NormalizedJob {
  const url = new URL(input.url);
  const posting = findJobPosting(input.jsonLd);
  const title = clean(posting?.title ?? input.safeMetadata?.title ?? input.title, 500);
  const employer = clean(companyName(posting) ?? input.safeMetadata?.employer, 500);
  const location = clean(locationName(posting) ?? input.safeMetadata?.location ?? '', 500);
  const description = clean(posting?.description ?? input.safeMetadata?.description ?? '', 100_000);
  if (!title || !employer || !description) throw new Error('APPLICATION_INPUT_REQUIRED');
  const sourceId = clean(posting?.identifier && typeof posting.identifier === 'object' ? (posting.identifier as Record<string, unknown>).value : posting?.identifier, 500) || createHash('sha256').update(url.href).digest('hex');
  const connectorId = policies.connectorForHost(url.hostname);
  const applicationUrl = clean(posting?.url ?? input.safeMetadata?.applicationUrl, 4_000) || url.href;
  const detection = resolver.detect(url, { applicationUrl });
  const fingerprint = createHash('sha256').update(`${connectorId}|${sourceId}`).digest('hex');
  return {
    id: randomUUID(), fingerprint, title, employer, location, description, url: url.href,
    source: { connectorId, externalId: sourceId, discoveredAt: new Date().toISOString(), discoveryMode: policies.get(connectorId).capabilities.discovery },
    applicationDestination: detection.destination,
    requiredSkills: stringList(posting?.skills ?? input.safeMetadata?.skills), preferredSkills: [],
    remote: /remote|work from home/i.test(`${location} ${description}`)
  };
}

export function extractSafeJobMetadata(html: string): { jsonLd?: unknown; title?: string } {
  if (Buffer.byteLength(html) > 1_000_000) throw new Error('APPLICATION_INPUT_REQUIRED');
  const $ = load(html); const candidates: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, node) => { try { candidates.push(JSON.parse($(node).text()) as unknown); } catch { /* malformed untrusted data */ } });
  const jsonLd = candidates.find((candidate) => Boolean(findJobPosting(candidate)));
  return { ...(jsonLd ? { jsonLd } : {}), title: clean($('title').first().text(), 500) };
}

function findJobPosting(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) { for (const item of value) { const found = findJobPosting(item); if (found) return found; } return undefined; }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record['@type'] === 'JobPosting' || (Array.isArray(record['@type']) && record['@type'].includes('JobPosting'))) return record;
  return findJobPosting(record['@graph']);
}
function companyName(posting?: Record<string, unknown>): unknown { const organization = posting?.hiringOrganization; return organization && typeof organization === 'object' ? (organization as Record<string, unknown>).name : undefined; }
function locationName(posting?: Record<string, unknown>): unknown { const location = posting?.jobLocation; const first = Array.isArray(location) ? location[0] : location; if (!first || typeof first !== 'object') return undefined; const address = (first as Record<string, unknown>).address; if (!address || typeof address !== 'object') return undefined; const item = address as Record<string, unknown>; return [item.addressLocality, item.addressRegion, item.addressCountry].filter(Boolean).join(', '); }
function clean(value: unknown, max: number): string { if (typeof value !== 'string' && typeof value !== 'number') return ''; return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function stringList(value: unknown): string[] { return (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;|]/) : []).map((item) => clean(item, 200)).filter(Boolean).slice(0, 200); }

export function sourceConnectorId(url: string, registry = defaultSitePolicyRegistry): ConnectorId { return registry.connectorForHost(new URL(url).hostname); }
