import { resolve } from 'node:path';
import { ArtifactStore } from '../packages/artifact-store/src/index.ts';
import { renderTailoredResume } from '../packages/resume-renderer/src/index.ts';

const output = resolve(process.argv[2] ?? 'tmp/pdfs');
const document = { version: 1 as const, title: 'Senior TypeScript Engineer', sourceResumeId: 'fixture-resume', profileSnapshotId: 'fixture-snapshot', jobId: 'fixture-job', sections: [{ id: 'skills', heading: 'Skills', lines: [{ text: 'TypeScript', supportingFactIds: ['fact-1'] }, { text: 'Node.js', supportingFactIds: ['fact-2'] }] }, { id: 'employment', heading: 'Experience', lines: [{ text: 'Built reliable TypeScript services at Example Labs', supportingFactIds: ['fact-3'] }] }, { id: 'education', heading: 'Education', lines: [{ text: 'Bachelor of Computer Science', supportingFactIds: ['fact-4'] }] }] };
const review = { changes: [{ kind: 'emphasize' as const, section: 'Skills', after: 'TypeScript\nNode.js', supportingFactIds: ['fact-1', 'fact-2'] }], matchedKeywords: ['typescript', 'node.js'], missingRequirements: [], supportingFacts: [], warnings: [] };
const validation = { valid: true, unsupportedLines: [], missingFactIds: [], warnings: [] };
const result = await renderTailoredResume({ document, review, validation, artifacts: new ArtifactStore(output) });
process.stdout.write(`${result.pdfPath}\n`);
