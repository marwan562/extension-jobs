import { createHash } from 'node:crypto';
import type { CanonicalFieldId, CanonicalFormField, FormFingerprint, VerifiedFact } from '../../shared-contracts/src/index.ts';

export interface InspectedField { id: string; label: string; name?: string | undefined; autocomplete?: string | undefined; type: CanonicalFormField['type']; required: boolean; options?: string[] | undefined; step?: number | undefined }

const rules: Array<{ id: CanonicalFieldId; pattern: RegExp; sensitive?: boolean }> = [
  { id: 'identity.first_name', pattern: /\b(first|given)\s*name\b/i }, { id: 'identity.middle_name', pattern: /\bmiddle\s*name\b/i },
  { id: 'identity.last_name', pattern: /\b(last|family|sur)\s*name\b/i }, { id: 'identity.full_name', pattern: /\b(full|legal)\s*name\b|^name$/i },
  { id: 'contact.email', pattern: /e-?mail/i }, { id: 'contact.phone', pattern: /phone|mobile|telephone/i },
  { id: 'contact.address', pattern: /street|address line/i }, { id: 'contact.city', pattern: /\bcity\b/i }, { id: 'contact.region', pattern: /state|province|region/i },
  { id: 'contact.postal_code', pattern: /postal|zip\s*code/i }, { id: 'contact.country', pattern: /\bcountry\b/i },
  { id: 'employment.current_company', pattern: /current (company|employer)/i }, { id: 'employment.current_title', pattern: /current (title|position)/i },
  { id: 'employment.years_experience', pattern: /years?.*(experience)|experience.*years?/i }, { id: 'employment.notice_period', pattern: /notice period|available to start/i },
  { id: 'education.highest_level', pattern: /highest.*education/i }, { id: 'education.school', pattern: /school|university|college/i },
  { id: 'education.degree', pattern: /\bdegree\b/i }, { id: 'education.field', pattern: /field of study|major/i },
  { id: 'links.linkedin', pattern: /linkedin/i }, { id: 'links.github', pattern: /github/i }, { id: 'links.portfolio', pattern: /portfolio/i }, { id: 'links.website', pattern: /website|personal url/i },
  { id: 'application.resume', pattern: /resume|curriculum vitae|\bcv\b/i }, { id: 'application.cover_letter', pattern: /cover letter/i },
  { id: 'application.salary_expectation', pattern: /salary|compensation|pay expectation/i, sensitive: true },
  { id: 'application.work_authorization', pattern: /work authori[sz]ation|legally authori[sz]ed/i, sensitive: true },
  { id: 'application.sponsorship_required', pattern: /sponsor|visa/i, sensitive: true },
  { id: 'application.relocation', pattern: /relocat/i, sensitive: true }, { id: 'application.remote_preference', pattern: /remote preference|workplace preference/i }
];

export function canonicalizeFields(fields: readonly InspectedField[]): CanonicalFormField[] {
  return fields.slice(0, 500).map((field) => {
    const text = `${field.label} ${field.name ?? ''} ${field.autocomplete ?? ''}`.trim();
    const matched = rules.find((rule) => rule.pattern.test(text));
    return { id: field.id, canonicalId: matched?.id ?? 'application.custom', label: field.label.slice(0, 1_000), type: field.type, required: field.required, sensitive: matched?.sensitive ?? sensitive(text), ...(field.options ? { options: field.options.slice(0, 500) } : {}), mappingConfidence: matched ? 0.98 : 0.2, step: field.step ?? 0 };
  });
}

export function deterministicAnswer(field: CanonicalFormField, facts: readonly VerifiedFact[]): { value: string; supportingFactIds: string[]; confirmationRequired: boolean; confidence: number } {
  if (field.canonicalId === 'application.custom') return { value: '', supportingFactIds: [], confirmationRequired: true, confidence: 0 };
  const fact = facts.find((candidate) => candidate.status === 'verified' && candidate.path === field.canonicalId);
  if (!fact) return { value: '', supportingFactIds: [], confirmationRequired: true, confidence: 0 };
  return { value: String(fact.value), supportingFactIds: [fact.id], confirmationRequired: field.sensitive, confidence: Math.min(1, fact.confidence) };
}

export function fingerprintForm(normalizedUrl: string, fields: readonly CanonicalFormField[], submitControl = 'semantic-submit-control:v1'): FormFingerprint {
  const normalized = fields.map(({ canonicalId, label, type, required, options, step }) => ({ canonicalId, label: label.toLowerCase().trim(), type, required, options: [...(options ?? [])].map((item) => item.toLowerCase().trim()).sort(), step })).sort((a, b) => `${a.step}:${a.canonicalId}:${a.label}`.localeCompare(`${b.step}:${b.canonicalId}:${b.label}`));
  const byStep = new Map<number, typeof normalized>(); for (const field of normalized) byStep.set(field.step, [...(byStep.get(field.step) ?? []), field]);
  const hash = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
  const fieldsHash = hash(normalized); const submitControlHash = hash(submitControl); const stepFingerprints = [...byStep.entries()].sort(([a], [b]) => a - b).map(([, step]) => hash(step));
  return { normalizedUrl: new URL(normalizedUrl).href, fieldsHash, submitControlHash, formVersion: hash({ normalizedUrl: new URL(normalizedUrl).href, fieldsHash, submitControlHash, stepFingerprints }), capturedAt: new Date().toISOString(), stepFingerprints };
}

function sensitive(value: string): boolean { return /salary|compensation|sponsor|visa|authori[sz]ation|relocat|demographic|disability|race|gender|background check|clearance/i.test(value); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`; return JSON.stringify(value); }
