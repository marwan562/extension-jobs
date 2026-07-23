import test from 'node:test'; import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { PDFParse } from 'pdf-parse';
import { ArtifactStore } from '../packages/artifact-store/src/index.ts';
import { renderTailoredResume } from '../packages/resume-renderer/src/index.ts';
import { Store } from '../apps/orchestrator/src/store.ts';
import { LocalWorkerClient } from '../apps/orchestrator/src/worker-client.ts';
import { BrowserWorkerRuntime } from '../apps/playwright-worker/src/worker-runtime.ts';
import { createResumeRenderHandler, type ResumeRenderResult } from '../apps/playwright-worker/src/resume-render-handler.ts';
import type { QueueJobType } from '../packages/shared-contracts/src/index.ts';

const document = { version: 1 as const, title: 'Senior TypeScript Engineer', sourceResumeId: 'resume-1', profileSnapshotId: 'snapshot-1', jobId: 'job-1', sections: [{ id: 'skills', heading: 'Skills', lines: [{ text: 'TypeScript', supportingFactIds: ['fact-1'] }, { text: 'Node.js', supportingFactIds: ['fact-2'] }] }, { id: 'employment', heading: 'Experience', lines: [{ text: 'Built reliable TypeScript services at Example Labs', supportingFactIds: ['fact-3'] }] }] };
const review = { changes: [{ kind: 'emphasize' as const, section: 'Skills', after: 'TypeScript\nNode.js', supportingFactIds: ['fact-1', 'fact-2'] }], matchedKeywords: ['typescript'], missingRequirements: [], supportingFacts: [], warnings: [] };
const validation = { valid: true, unsupportedLines: [], missingFactIds: [], warnings: [] };

test('renderer creates selectable ATS-safe PDF and stable canonical artifacts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'extension-jobs-render-')); const artifacts = new ArtifactStore(root); const rendered = await renderTailoredResume({ document, review, validation, artifacts });
  const parser = new PDFParse({ data: artifacts.read(rendered.pdf.id, 'pdf', 'resume-pdf') }); try { const text = (await parser.getText()).text; assert.match(text, /TypeScript/); assert.match(text, /Example Labs/); } finally { await parser.destroy(); }
  assert.equal(artifacts.read(rendered.json.id, 'json', 'resume-json').toString().includes('supportingFactIds'), true);
  const repeated = await renderTailoredResume({ document, review, validation, artifacts }); assert.equal(repeated.json.sha256, rendered.json.sha256); assert.equal(repeated.html.sha256, rendered.html.sha256); assert.equal(repeated.pdf.sha256, rendered.pdf.sha256);
});

test('coordinator renders through an authenticated standalone worker without exposing paths', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'extension-jobs-render-worker-')); const store = new Store(join(root, 'jobs.sqlite')); const token = 'resume-worker-test-token-that-is-long-enough';
  const handlers = new Map<QueueJobType, ReturnType<typeof createResumeRenderHandler>>([['resume.render', createResumeRenderHandler(store, token, root)]]);
  const runtime = new BrowserWorkerRuntime(store.queue, { workerId: 'resume-render-test-worker', handlers, pollMs: 10 }); runtime.start(); t.after(async () => { await runtime.stop(); store.close(); });
  const result = await new LocalWorkerClient(store, token, 30_000).execute<ResumeRenderResult>('resume.render', 'renderResume', { document, review, validation });
  assert.equal(result.artifacts.pdf.mediaType, 'application/pdf'); assert.equal(store.getArtifact(result.artifacts.pdf.id)?.sha256, result.artifacts.pdf.sha256); assert.equal(JSON.stringify(result).includes(root), false);
});
