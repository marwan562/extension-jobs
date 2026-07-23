import { createHash, randomUUID } from 'node:crypto';
import type { NormalizedJob, TailoredResume, TailoringChange, VerifiedFact } from '../../shared-contracts/src/index.ts';
import type { CanonicalCandidateProfile } from '../../resume-importers/src/index.ts';

export interface ResumeLine { text: string; supportingFactIds: string[] }
export interface ResumeSection { id: string; heading: string; lines: ResumeLine[] }
export interface CanonicalResumeDocument { version: 1; title: string; sections: ResumeSection[]; sourceResumeId: string; profileSnapshotId: string; jobId: string }
export interface TailoringReview { changes: TailoringChange[]; matchedKeywords: string[]; missingRequirements: string[]; supportingFacts: Array<{ id: string; path: string; value: string | number | boolean }>; warnings: string[] }
export interface TailoringResult { tailoredResume: TailoredResume; document: CanonicalResumeDocument; review: TailoringReview; validation: ValidationReport }
export interface ValidationReport { valid: boolean; unsupportedLines: string[]; missingFactIds: string[]; warnings: string[] }

export function tailorResume(input: { sourceResumeId: string; profileSnapshotId: string; profile: CanonicalCandidateProfile; job: NormalizedJob }): TailoringResult {
  const verified = input.profile.facts.filter((fact) => fact.status === 'verified'); if (!verified.length) throw new TailoringError('PROFILE_INCOMPLETE', 'Verify resume facts before tailoring');
  const jobTerms = keywords(`${input.job.title} ${input.job.description} ${input.job.requiredSkills.join(' ')}`); const ranked = verified.map((fact) => ({ fact, relevance: overlap(keywords(String(fact.value)), jobTerms) })).sort((a, b) => b.relevance - a.relevance || a.fact.path.localeCompare(b.fact.path));
  const selected = ranked.filter((item) => item.relevance > 0).map((item) => item.fact); const fallback = verified.filter((fact) => /^(employment|education|projects|skills|certifications|links)\./.test(fact.path)); const chosen = uniqueFacts([...selected, ...fallback]).slice(0, 80);
  const sectionOrder = ['summary', 'skills', 'employment', 'projects', 'education', 'certifications', 'links']; const sections: ResumeSection[] = [];
  for (const prefix of sectionOrder) { const facts = chosen.filter((fact) => fact.path === prefix || fact.path.startsWith(`${prefix}.`)); if (!facts.length) continue; sections.push({ id: prefix, heading: heading(prefix), lines: facts.map((fact) => ({ text: String(fact.value), supportingFactIds: [fact.id] })) }); }
  const document: CanonicalResumeDocument = { version: 1, title: input.job.title, sections, sourceResumeId: input.sourceResumeId, profileSnapshotId: input.profileSnapshotId, jobId: input.job.id };
  const matchedKeywords = [...new Set(chosen.flatMap((fact) => keywords(String(fact.value)).filter((term) => jobTerms.includes(term))))].sort(); const missingRequirements = input.job.requiredSkills.filter((skill) => !chosen.some((fact) => includesTerm(String(fact.value), skill)));
  const changes: TailoringChange[] = sections.map((section) => ({ kind: section.id === 'skills' ? 'emphasize' : 'reorder', section: section.heading, after: section.lines.map((line) => line.text).join('\n'), supportingFactIds: section.lines.flatMap((line) => line.supportingFactIds) }));
  const review: TailoringReview = { changes, matchedKeywords, missingRequirements, supportingFacts: chosen.map(({ id, path, value }) => ({ id, path, value })), warnings: missingRequirements.length ? ['Some job requirements have no verified supporting fact and were not added.'] : [] };
  const validation = validateResumeDocument(document, verified); const generatedDocumentHash = createHash('sha256').update(stable(document)).digest('hex');
  const tailoredResume: TailoredResume = { id: randomUUID(), sourceResumeId: input.sourceResumeId, profileSnapshotId: input.profileSnapshotId, jobId: input.job.id, jobFingerprint: input.job.fingerprint, tailoringPlan: changes, selectedFactIds: chosen.map((fact) => fact.id), generatedDocumentHash, approved: false, createdAt: new Date().toISOString() };
  return { tailoredResume, document, review, validation };
}

export function validateResumeDocument(document: CanonicalResumeDocument, facts: readonly VerifiedFact[]): ValidationReport {
  const verified = new Set(facts.filter((fact) => fact.status === 'verified').map((fact) => fact.id)); const missingFactIds: string[] = []; const unsupportedLines: string[] = [];
  for (const section of document.sections) for (const line of section.lines) { if (!line.supportingFactIds.length) unsupportedLines.push(line.text); for (const id of line.supportingFactIds) if (!verified.has(id)) missingFactIds.push(id); }
  return { valid: !unsupportedLines.length && !missingFactIds.length, unsupportedLines, missingFactIds: [...new Set(missingFactIds)], warnings: [] };
}
export class TailoringError extends Error { readonly code: string; constructor(code: string, message: string) { super(message); this.code = code; } }
function uniqueFacts(facts: VerifiedFact[]): VerifiedFact[] { const seen = new Set<string>(); return facts.filter((fact) => !seen.has(fact.id) && Boolean(seen.add(fact.id))); }
function keywords(value: string): string[] { const stop = new Set(['and', 'the', 'with', 'for', 'from', 'that', 'this', 'your', 'you', 'are', 'will', 'our', 'job', 'role']); return [...new Set(value.toLowerCase().match(/[a-z0-9+#.]{2,}/g)?.filter((term) => !stop.has(term)) ?? [])]; }
function overlap(a: string[], b: string[]): number { const right = new Set(b); return a.reduce((count, item) => count + (right.has(item) ? 1 : 0), 0); }
function includesTerm(value: string, term: string): boolean { const a = value.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' '); const b = term.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim(); return a.includes(b) || b.includes(a.trim()); }
function heading(value: string): string { return value === 'employment' ? 'Experience' : value[0]!.toUpperCase() + value.slice(1); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`; return JSON.stringify(value); }
