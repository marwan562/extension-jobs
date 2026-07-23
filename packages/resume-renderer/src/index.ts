import { PDFDocument } from 'pdf-lib';
import { chromium, type Browser } from 'playwright';
import type { Artifact } from '../../shared-contracts/src/index.ts';
import type { ArtifactStore } from '../../artifact-store/src/index.ts';
import type { CanonicalResumeDocument, TailoringReview, ValidationReport } from '../../resume-tailor/src/index.ts';

export interface RenderedResumeArtifacts { json: Artifact; html: Artifact; pdf: Artifact; diff: Artifact; validation: Artifact; pdfPath: string }

export async function renderTailoredResume(input: { document: CanonicalResumeDocument; review: TailoringReview; validation: ValidationReport; artifacts: ArtifactStore; browser?: Browser }): Promise<RenderedResumeArtifacts> {
  if (!input.validation.valid) throw new RenderError('RESUME_FACT_VALIDATION_FAILED', 'Resume document contains unsupported statements');
  const canonicalJson = stablePretty(input.document); const html = renderResumeHtml(input.document);
  const json = input.artifacts.put('resume-json', 'application/json', canonicalJson, 'json');
  const htmlArtifact = input.artifacts.put('resume-html', 'text/html', html, 'html');
  const diff = input.artifacts.put('tailoring-diff', 'application/json', stablePretty(input.review), 'json');
  const validation = input.artifacts.put('validation-report', 'application/json', stablePretty(input.validation), 'json');
  const owned = !input.browser; const browser = input.browser ?? await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 816, height: 1056 } }); await page.setContent(html, { waitUntil: 'load' }); await page.emulateMedia({ media: 'print' });
    const raw = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' }, tagged: true }); await page.close();
    const pdfBytes = await normalizePdf(raw); const pdf = input.artifacts.put('resume-pdf', 'application/pdf', pdfBytes, 'pdf', { documentHash: json.sha256 });
    return { json, html: htmlArtifact, pdf, diff, validation, pdfPath: input.artifacts.resolveArtifact(pdf.id, 'resume-pdf', 'pdf') };
  } finally { if (owned) await browser.close(); }
}

export function renderResumeHtml(document: CanonicalResumeDocument): string {
  const sections = document.sections.map((section) => `<section data-section="${escapeHtml(section.id)}"><h2>${escapeHtml(section.heading)}</h2><ul>${section.lines.map((line) => `<li>${escapeHtml(line.text)}</li>`).join('')}</ul></section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(document.title)} - Tailored Resume</title><style>@page{size:A4;margin:15mm 16mm 16mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.35}main{width:100%}h1{font-size:19pt;line-height:1.15;margin:0 0 5mm;border-bottom:1.2pt solid #222;padding-bottom:2.5mm}section{break-inside:avoid;margin:0 0 4mm}h2{font-size:11.5pt;line-height:1.2;text-transform:uppercase;letter-spacing:.04em;margin:0 0 1.8mm;border-bottom:.5pt solid #777;padding-bottom:1mm}ul{margin:0;padding-left:5mm}li{margin:0 0 1.2mm;break-inside:avoid}a{color:#111;text-decoration:none}</style></head><body><main><h1>${escapeHtml(document.title)}</h1>${sections}</main></body></html>`;
}

async function normalizePdf(bytes: Uint8Array): Promise<Uint8Array> { const pdf = await PDFDocument.load(bytes, { updateMetadata: false }); const epoch = new Date('2000-01-01T00:00:00.000Z'); pdf.setTitle('Tailored Resume'); pdf.setAuthor('Extension Jobs'); pdf.setSubject('ATS-safe tailored resume'); pdf.setCreator('Extension Jobs'); pdf.setProducer('Extension Jobs deterministic renderer'); pdf.setCreationDate(epoch); pdf.setModificationDate(epoch); return pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: Number.MAX_SAFE_INTEGER }); }
function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function stablePretty(value: unknown): string { return `${JSON.stringify(sort(value), null, 2)}\n`; }
function sort(value: unknown): unknown { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)])); return value; }
export class RenderError extends Error { readonly code: string; constructor(code: string, message: string) { super(message); this.code = code; } }
