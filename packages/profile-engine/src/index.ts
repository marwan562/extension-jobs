import { randomUUID } from 'node:crypto';
import type { CandidateProfile, FieldAnswer, ProfileFact } from '../../shared/src/domain.ts';

const sensitivePatterns = [/salary|compensation|pay/i, /sponsor|visa|work authorization|legally authorized/i, /relocat/i, /background check/i, /disab|demographic|race|ethnic|gender/i, /security clearance/i, /legal declaration|terms and conditions/i, /upload|resume|cv|file/i];

export function isSensitiveField(label: string): boolean { return sensitivePatterns.some((pattern) => pattern.test(label)); }

export function importCvText(name: string, sourceName: string, text: string): CandidateProfile {
  const now = new Date().toISOString(); const facts: ProfileFact[] = [];
  const add = (path: string, value: string | number | boolean) => facts.push({ id: randomUUID(), path, value, kind: 'verified_fact', source: 'cv_import', verifiedAt: now });
  const email = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]; if (email) add('identity.email', email);
  const phone = text.match(/\+?[\d][\d ()-]{7,}\d/)?.[0]; if (phone) add('identity.phone', phone.trim());
  const links = text.match(/https?:\/\/[^\s)]+/g) ?? []; links.forEach((link, i) => add(`links.${i}`, link));
  const skillLine = text.split('\n').find((line) => /^\s*(skills|technologies)\s*:/i.test(line));
  skillLine?.replace(/^.*?:/, '').split(/[,|•]/).map((s) => s.trim()).filter(Boolean).forEach((skill, i) => add(`skills.${i}`, skill));
  add('source.rawText', text.slice(0, 20_000));
  return { id: randomUUID(), name, facts, cvVariants: [{ id: randomUUID(), name: 'Imported CV', approved: false, sourceName }], updatedAt: now };
}

export function updateProfileFact(profile: CandidateProfile, factId: string, value: ProfileFact['value']): CandidateProfile {
  const facts = profile.facts.map((fact) => fact.id === factId ? { ...fact, value, kind: 'verified_fact' as const, source: 'user_edit' as const, verifiedAt: new Date().toISOString() } : fact);
  if (!facts.some((fact) => fact.id === factId)) throw new Error('Fact not found');
  return { ...profile, facts, updatedAt: new Date().toISOString() };
}

export function prepareAnswer(label: string, profile: CandidateProfile, model = 'deterministic-profile-retrieval'): FieldAnswer {
  const lower = label.toLowerCase();
  const candidate = profile.facts.find((fact) => {
    if (lower.includes('email')) return fact.path === 'identity.email';
    if (lower.includes('phone')) return fact.path === 'identity.phone';
    if (lower.includes('skill')) return fact.path.startsWith('skills.');
    return fact.path.split('.').some((part) => lower.includes(part.toLowerCase()));
  });
  const confidence = candidate ? 0.98 : 0;
  return {
    fieldId: randomUUID(), label, value: candidate ? String(candidate.value) : '', confidence,
    supportingFactIds: candidate ? [candidate.id] : [], confirmationRequired: isSensitiveField(label) || confidence < 0.8,
    ...(candidate ? {} : { reason: 'No verified profile fact supports this answer' }), generatedAt: new Date().toISOString(), model
  };
}

export function approveAnswer(answer: FieldAnswer): ProfileFact {
  return { id: randomUUID(), path: `approvedAnswers.${normalizeQuestion(answer.label)}`, value: answer.value, kind: 'approved_answer', source: 'answer_approval', verifiedAt: new Date().toISOString() };
}

export function normalizeQuestion(question: string): string { return question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

export function generatedAnswerCannotVerify(answer: FieldAnswer): ProfileFact {
  return { id: randomUUID(), path: `generated.${normalizeQuestion(answer.label)}`, value: answer.value, kind: 'generated_prose', source: 'answer_approval' };
}
