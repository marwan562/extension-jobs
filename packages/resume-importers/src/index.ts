import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { parse as parseYaml } from 'yaml';
import type { ResumeSource, VerifiedFact } from '../../shared-contracts/src/index.ts';
import { ArtifactStore } from '../../artifact-store/src/index.ts';

export interface CanonicalCandidateProfile {
  id: string; identity: Record<string, VerifiedFact>; contact: Record<string, VerifiedFact>;
  summary?: VerifiedFact; skills: VerifiedFact[]; employment: VerifiedFact[]; education: VerifiedFact[];
  projects: VerifiedFact[]; certifications: VerifiedFact[]; languages: VerifiedFact[]; links: VerifiedFact[];
  preferences: VerifiedFact[]; facts: VerifiedFact[]; createdAt: string; updatedAt: string;
}
export interface ImportedResume { source: ResumeSource; profile: CanonicalCandidateProfile; extractedText: string; sourceArtifactId: string }

export class ResumeVault {
  private readonly artifacts: ArtifactStore; private readonly maxBytes: number;
  constructor(artifacts: ArtifactStore, maxBytes = 5 * 1024 * 1024) { this.artifacts = artifacts; this.maxBytes = maxBytes; }
  async importPath(profileId: string, inputPath: string): Promise<ImportedResume> {
    if (!inputPath || inputPath.includes('\0')) throw new ResumeImportError('APPLICATION_INPUT_REQUIRED', 'A resume path selected by the user is required');
    const selected = realpathSync(inputPath); const link = lstatSync(inputPath); const stat = statSync(selected); if (!link.isFile() && !link.isSymbolicLink() || !stat.isFile()) throw new ResumeImportError('APPLICATION_INPUT_REQUIRED', 'Resume must be a regular file');
    if (stat.size < 1 || stat.size > this.maxBytes) throw new ResumeImportError('APPLICATION_INPUT_REQUIRED', `Resume must be between 1 byte and ${this.maxBytes} bytes`);
    const bytes = readFileSync(selected); return this.importBytes(profileId, basename(selected), bytes);
  }
  async importBytes(profileId: string, suppliedName: string, input: Uint8Array): Promise<ImportedResume> {
    const bytes = Buffer.from(input); if (bytes.length < 1 || bytes.length > this.maxBytes) throw new ResumeImportError('APPLICATION_INPUT_REQUIRED', `Resume must be between 1 byte and ${this.maxBytes} bytes`);
    const displayName = safeName(basename(suppliedName)); const mediaType = detectMediaType(displayName, bytes); const extension = extensionFor(mediaType);
    const artifact = this.artifacts.put('resume-source', mediaType, bytes, extension, { displayName });
    const extractedText = await extractText(mediaType, bytes); if (!extractedText.trim()) throw new ResumeImportError('PROFILE_INCOMPLETE', 'No resume text could be extracted');
    const now = new Date().toISOString(); const source: ResumeSource = { id: randomUUID(), profileId, displayName, mediaType, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, approved: false, createdAt: now };
    return { source, profile: profileFromText(profileId, extractedText, artifact.id, now), extractedText, sourceArtifactId: artifact.id };
  }
}

export class ResumeImportError extends Error { readonly code: string; constructor(code: string, message: string) { super(message); this.code = code; } }

export async function extractText(mediaType: ResumeSource['mediaType'], bytes: Uint8Array): Promise<string> {
  if (mediaType === 'application/pdf') { const parser = new PDFParse({ data: bytes }); try { return normalizeText((await parser.getText()).text); } finally { await parser.destroy(); } }
  if (mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return normalizeText((await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value);
  const text = Buffer.from(bytes).toString('utf8');
  if (mediaType === 'application/json' || mediaType === 'application/yaml') { const value = mediaType === 'application/json' ? JSON.parse(text) as unknown : parseYaml(text) as unknown; return normalizeText(flatten(value).join('\n')); }
  return normalizeText(text);
}

export function profileFromText(profileId: string, text: string, sourceArtifactId: string, now = new Date().toISOString()): CanonicalCandidateProfile {
  const facts: VerifiedFact[] = []; const add = (path: string, value: string, sourceLocation?: string, confidence = 0.9) => { if (!value.trim()) return; facts.push({ id: randomUUID(), path, value: value.trim(), sourceArtifactId, ...(sourceLocation ? { sourceLocation } : {}), confidence, status: 'extracted', createdAt: now, updatedAt: now }); };
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean); const email = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]; const phone = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0];
  if (email) add('contact.email', email, 'detected email', 0.99); if (phone) add('contact.phone', phone, 'detected phone', 0.9);
  const urls = [...text.matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0]); for (const url of urls.slice(0, 20)) add(url.includes('linkedin.com') ? 'links.linkedin' : url.includes('github.com') ? 'links.github' : 'links.website', url, 'detected link', 0.95);
  const skillLine = lines.find((line) => /^(skills|technologies|technical skills)\s*[:|-]/i.test(line)); if (skillLine) for (const skill of skillLine.replace(/^[^:|-]+[:|-]/, '').split(/[,;|]/).map((item) => item.trim()).filter(Boolean).slice(0, 100)) add(`skills.${slug(skill)}`, skill, skillLine, 0.8);
  const section = classifySections(lines); for (const item of section.employment) add(`employment.${facts.length}`, item, item, 0.7); for (const item of section.education) add(`education.${facts.length}`, item, item, 0.7); for (const item of section.projects) add(`projects.${facts.length}`, item, item, 0.7); for (const item of section.certifications) add(`certifications.${facts.length}`, item, item, 0.7); for (const item of section.languages) add(`languages.${facts.length}`, item, item, 0.7);
  const by = (prefix: string) => facts.filter((fact) => fact.path.startsWith(`${prefix}.`)); const identity = Object.fromEntries(facts.filter((fact) => fact.path.startsWith('identity.')).map((fact) => [fact.path.slice(9), fact])); const contact = Object.fromEntries(facts.filter((fact) => fact.path.startsWith('contact.')).map((fact) => [fact.path.slice(8), fact]));
  return { id: profileId, identity, contact, skills: by('skills'), employment: by('employment'), education: by('education'), projects: by('projects'), certifications: by('certifications'), languages: by('languages'), links: by('links'), preferences: [], facts, createdAt: now, updatedAt: now };
}

function detectMediaType(name: string, bytes: Buffer): ResumeSource['mediaType'] {
  const ext = extname(name).toLowerCase(); const pdf = bytes.subarray(0, 5).toString() === '%PDF-'; const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; const binary = bytes.subarray(0, Math.min(bytes.length, 8_192)).includes(0);
  if (ext === '.pdf' && pdf) return 'application/pdf'; if (ext === '.docx' && zip) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (binary) throw new ResumeImportError('APPLICATION_INPUT_REQUIRED', 'Resume signature does not match a supported format');
  if (ext === '.md' || ext === '.markdown') return 'text/markdown'; if (ext === '.txt') return 'text/plain'; if (ext === '.json') { JSON.parse(bytes.toString('utf8')); return 'application/json'; } if (ext === '.yaml' || ext === '.yml') { parseYaml(bytes.toString('utf8')); return 'application/yaml'; }
  throw new ResumeImportError('APPLICATION_INPUT_REQUIRED', 'Supported resume formats are PDF, DOCX, Markdown, text, JSON, and YAML');
}
function extensionFor(mediaType: ResumeSource['mediaType']): string { return mediaType === 'application/pdf' ? 'pdf' : mediaType.includes('wordprocessing') ? 'docx' : mediaType === 'text/markdown' ? 'md' : mediaType === 'text/plain' ? 'txt' : mediaType === 'application/json' ? 'json' : 'yaml'; }
function safeName(value: string): string { return value.replace(/[\u0000-\u001f\/\\]/g, '_').slice(0, 200) || 'resume'; }
function normalizeText(value: string): string { return value.replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300_000); }
function flatten(value: unknown, prefix = ''): string[] { if (Array.isArray(value)) return value.flatMap((item, index) => flatten(item, `${prefix}[${index}]`)); if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key)); return value === undefined || value === null ? [] : [`${prefix}: ${String(value)}`]; }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100); }
function classifySections(lines: string[]): Record<'employment' | 'education' | 'projects' | 'certifications' | 'languages', string[]> { const result = { employment: [] as string[], education: [] as string[], projects: [] as string[], certifications: [] as string[], languages: [] as string[] }; let current: keyof typeof result | undefined; for (const line of lines) { if (/^(experience|employment|work history)\b/i.test(line)) { current = 'employment'; continue; } if (/^education\b/i.test(line)) { current = 'education'; continue; } if (/^projects?\b/i.test(line)) { current = 'projects'; continue; } if (/^certifications?\b/i.test(line)) { current = 'certifications'; continue; } if (/^languages?\b/i.test(line)) { current = 'languages'; continue; } if (current && result[current].length < 100 && line.length <= 500) result[current].push(line); } return result; }
