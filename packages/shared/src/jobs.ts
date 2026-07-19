import { createHash, randomUUID } from 'node:crypto';
import type { CandidateProfile, Job, JobCampaign, RawJob } from './domain.ts';

const clean = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

export function fingerprintJob(job: RawJob): string {
  const basis = job.sourceId ? `${clean(job.source)}|${clean(job.sourceId)}` : [job.employer, job.title, job.location, job.description.slice(0, 500)].map(clean).join('|');
  return createHash('sha256').update(basis).digest('hex');
}

export function normalizeJob(raw: RawJob): Job {
  const normalized: RawJob = { ...raw, title: raw.title.trim(), employer: raw.employer.trim(), location: raw.location.trim(), description: raw.description.trim() };
  return { ...normalized, id: randomUUID(), fingerprint: fingerprintJob(normalized), matchScore: 0, scoreExplanation: [] };
}

export function deduplicateJobs(jobs: Job[]): { unique: Job[]; duplicateIds: string[] } {
  const seen = new Set<string>(); const unique: Job[] = []; const duplicateIds: string[] = [];
  for (const job of jobs) { if (seen.has(job.fingerprint)) duplicateIds.push(job.id); else { seen.add(job.fingerprint); unique.push(job); } }
  return { unique, duplicateIds };
}

export function scoreJob(job: Job, profile: CandidateProfile, campaign: JobCampaign): Job {
  const skills = profile.facts.filter((f) => f.path.startsWith('skills.')).map((f) => clean(String(f.value)));
  const description = clean(`${job.title} ${job.description}`);
  const required = job.requiredSkills ?? [];
  const skillMatches = required.filter((s) => skills.some((p) => p.includes(clean(s)) || clean(s).includes(p))).length;
  const skillPoints = required.length ? Math.round(50 * skillMatches / required.length) : 20;
  const locationMatch = campaign.locations.some((l) => clean(job.location).includes(clean(l))) || (job.remote && campaign.workplace.includes('remote'));
  const locationPoints = locationMatch ? 20 : 0;
  const keywordMatches = campaign.includedKeywords.filter((k) => description.includes(clean(k))).length;
  const keywordPoints = campaign.includedKeywords.length ? Math.round(20 * keywordMatches / campaign.includedKeywords.length) : 10;
  const excluded = campaign.excludedKeywords.filter((k) => description.includes(clean(k)));
  const exclusionPoints = excluded.length ? -50 : 0;
  const seniorityPoints = !job.seniority || campaign.seniority.some((s) => clean(s) === clean(job.seniority!)) ? 10 : 0;
  const explanation = [
    { factor: 'required_skills', points: skillPoints, reason: `${skillMatches}/${required.length || 0} required skills matched` },
    { factor: 'location', points: locationPoints, reason: locationMatch ? 'Location/workplace matched' : 'Location did not match' },
    { factor: 'keywords', points: keywordPoints, reason: `${keywordMatches} preferred keywords matched` },
    { factor: 'seniority', points: seniorityPoints, reason: seniorityPoints ? 'Seniority matched or unspecified' : 'Seniority mismatch' },
    { factor: 'exclusions', points: exclusionPoints, reason: excluded.length ? `Excluded: ${excluded.join(', ')}` : 'No excluded keywords' }
  ];
  return { ...job, matchScore: Math.max(0, Math.min(100, explanation.reduce((sum, item) => sum + item.points, 0))), scoreExplanation: explanation };
}
