import { chromium, type Browser, type Page } from 'playwright';
import type { AdapterContext, ApprovedFile, FormField, JobSiteAdapter } from '../../../packages/site-adapters/src/index.ts';
import type { FieldAnswer, Job, RawJob } from '../../../packages/shared/src/domain.ts';
import { normalizeJob } from '../../../packages/shared/src/jobs.ts';

export class DevelopmentAdapter implements JobSiteAdapter {
  id = 'development'; private browser: Browser | undefined; private readonly pages = new Map<string, Page>();
  matches(url: URL): boolean { return url.hostname === '127.0.0.1' && url.port === '18791'; }
  async authenticate(): Promise<{ status: 'authenticated' }> { return { status: 'authenticated' }; }
  async discover(): Promise<RawJob[]> { return []; }
  async readJob(url: URL): Promise<Job> { return normalizeJob({ source: this.id, sourceId: 'mock-1', url: url.href, title: 'Backend Engineer', employer: 'Example Labs', location: 'Remote', description: 'TypeScript Node.js', requiredSkills: ['TypeScript', 'Node.js'], remote: true }); }
  async startApplication(job: Job, context: AdapterContext): Promise<{ id: string; url: string }> { context.signal.throwIfAborted(); this.browser ??= await chromium.launch({ headless: true }); const page = await this.browser.newPage(); await page.goto(job.url); const id = crypto.randomUUID(); this.pages.set(id, page); return { id, url: job.url }; }
  async collectFields(session: { id: string }): Promise<FormField[]> { const page = this.page(session.id); return page.locator('form [required], form input, form select, form textarea').evaluateAll((nodes) => nodes.filter((node) => (node as HTMLElement).tagName !== 'BUTTON').map((node) => { const el = node as HTMLInputElement | HTMLSelectElement; const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() : el.getAttribute('aria-label'); return { id: el.id, label: label ?? el.name, type: el.type === 'email' ? 'email' : el.type === 'tel' ? 'tel' : el.tagName === 'SELECT' ? 'select' : 'text', required: el.required, ...(el instanceof HTMLSelectElement ? { options: Array.from(el.options).map((o) => o.text).filter(Boolean) } : {}) }; })) as Promise<FormField[]>; }
  async fillFields(session: { id: string }, answers: FieldAnswer[], context: AdapterContext): Promise<{ filled: string[]; skipped: string[] }> {
    context.signal.throwIfAborted(); const page = this.page(session.id); const filled: string[] = [], skipped: string[] = [];
    for (const answer of answers) { if (answer.confirmationRequired || !answer.value) { skipped.push(answer.label); continue; } const locator = page.getByLabel(answer.label, { exact: true }); if (await locator.count() !== 1) { skipped.push(answer.label); continue; } if (!context.dryRun) { const tag = await locator.evaluate((el) => el.tagName); if (tag === 'SELECT') await locator.selectOption({ label: answer.value }); else await locator.fill(answer.value); } filled.push(answer.label); } return { filled, skipped };
  }
  async uploadApprovedFile(): Promise<{ uploaded: boolean }> { return { uploaded: false }; }
  async validate(session: { id: string }): Promise<{ valid: boolean; errors: string[] }> { const page = this.page(session.id); const invalid = await page.locator('form :invalid').count(); const submitted = (await page.locator('#submitted').textContent())?.trim(); return { valid: invalid === 0 && submitted === 'not submitted', errors: [...(invalid ? [`${invalid} invalid fields`] : []), ...(submitted !== 'not submitted' ? ['Submission safety invariant violated'] : [])] }; }
  async close(): Promise<void> { await this.browser?.close(); this.pages.clear(); this.browser = undefined; }
  private page(id: string): Page { const page = this.pages.get(id); if (!page) throw new Error('Application session not found'); return page; }
}
