import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { FieldAnswer, Job, RawJob } from '../../shared/src/domain.ts';
import { normalizeJob } from '../../shared/src/jobs.ts';
import { WuzzufToolError, type WuzzufSearchInput } from '../../shared/src/wuzzuf.ts';
import type { AdapterContext, ApprovedFile, FormField, JobSiteAdapter, JobSource } from './index.ts';
import { detectWuzzufPageState, normalizeWuzzufUrl, parseWuzzufJobHtml, parseWuzzufSearchHtml } from './wuzzuf-parser.ts';
import { wuzzufSelectors } from './wuzzuf-selectors.ts';

export interface WuzzufAdapterOptions {
  dataDir?: string;
  baseUrl?: string;
  headless?: boolean;
  navigationTimeoutMs?: number;
  screenshotDir?: string;
}

interface ApplicationPage { page: Page; context: BrowserContext }

export class WuzzufJobSource implements JobSource {
  readonly id = 'wuzzuf';
  private readonly adapter: WuzzufAdapter;
  constructor(adapter?: WuzzufAdapter) { this.adapter = adapter ?? new WuzzufAdapter(); }
  discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> { return this.adapter.discover(criteria); }
}

export class WuzzufAdapter implements JobSiteAdapter {
  readonly id = 'wuzzuf';
  private persistentContext: BrowserContext | undefined;
  private persistentHeadless: boolean | undefined;
  private readonly applications = new Map<string, ApplicationPage>();
  private readonly dataDir: string;
  private readonly baseUrl: string;
  private readonly headless: boolean;
  private readonly timeoutMs: number;
  private readonly screenshotDir: string;

  constructor(options: WuzzufAdapterOptions = {}) {
    this.dataDir = resolve(options.dataDir ?? process.env.WUZZUF_DATA_DIR ?? '.data/wuzzuf-browser');
    this.baseUrl = new URL(options.baseUrl ?? process.env.WUZZUF_BASE_URL ?? 'https://wuzzuf.net').origin;
    this.headless = options.headless ?? process.env.WUZZUF_HEADLESS !== 'false';
    this.timeoutMs = options.navigationTimeoutMs ?? Number(process.env.WUZZUF_NAVIGATION_TIMEOUT_MS ?? 30_000);
    this.screenshotDir = resolve(options.screenshotDir ?? process.env.WUZZUF_SCREENSHOT_DIR ?? '.data/wuzzuf-diagnostics');
  }

  matches(url: URL): boolean { try { return normalizeWuzzufUrl(url.href, this.baseUrl) === normalizeWuzzufUrl(url.href, this.baseUrl); } catch { return false; } }
  normalizeUrl(value: string): string { return normalizeWuzzufUrl(value, this.baseUrl); }

  async authenticate(context: AdapterContext): Promise<{ status: 'authenticated' | 'handoff_required'; reason?: string }> {
    context.signal.throwIfAborted(); const state = await this.authenticationStatus(context.signal);
    return state.authenticated ? { status: 'authenticated' } : { status: 'handoff_required', reason: state.code };
  }

  async authenticationStatus(signal?: AbortSignal): Promise<{ authenticated: boolean; code: 'AUTHENTICATED' | 'WUZZUF_LOGIN_REQUIRED' | 'WUZZUF_CHALLENGE_REQUIRED' }> {
    const page = await this.newPage(this.headless); try {
      await this.goto(page, new URL('/me/applications', this.baseUrl).href, signal);
      const state = detectWuzzufPageState(await page.content());
      if (state === 'challenge') return { authenticated: false, code: 'WUZZUF_CHALLENGE_REQUIRED' };
      const authenticatedMarker = await countAny(page, wuzzufSelectors.authenticatedMarker);
      const loginMarker = await countAny(page, wuzzufSelectors.loginMarker);
      return authenticatedMarker > 0 && loginMarker === 0 ? { authenticated: true, code: 'AUTHENTICATED' } : { authenticated: false, code: 'WUZZUF_LOGIN_REQUIRED' };
    } finally { await page.close(); }
  }

  async openLogin(): Promise<{ opened: true; message: string }> {
    await this.closePersistentContext();
    const page = await this.newPage(false);
    await page.goto(new URL('/login', this.baseUrl).href, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
    return { opened: true, message: 'Complete login in the Wuzzuf browser window, then close it or check status again.' };
  }

  async discover(criteria: WuzzufSearchInput | { queries: string[]; locations: string[] }): Promise<RawJob[]> {
    const input = criteria as WuzzufSearchInput; const limit = Math.max(1, Math.min(input.limit ?? 25, 100)); const seen = new Set<string>(); const jobs: RawJob[] = [];
    for (const query of input.queries) {
      for (const location of input.locations) {
        let pageNumber = 0;
        while (jobs.length < limit && pageNumber < 10) {
          const search = new URL('/search/jobs/', this.baseUrl); search.searchParams.set('q', query); search.searchParams.set('l', location); if (pageNumber) search.searchParams.set('start', String(pageNumber));
          const page = await this.newPage(this.headless); try {
            await this.goto(page, search.href); const parsed = parseWuzzufSearchHtml(await page.content(), this.baseUrl); const before = jobs.length;
            for (const job of parsed) {
              if (seen.has(job.sourceId) || (input.remote === true && !job.remote) || (input.experienceLevel && job.experienceLevel !== input.experienceLevel.toLowerCase()) || (input.employmentTypes?.length && !input.employmentTypes.map((value) => value.toLowerCase()).includes(job.employmentType ?? ''))) continue;
              seen.add(job.sourceId); jobs.push(job); if (jobs.length >= limit) break;
            }
            if (parsed.length === 0 || jobs.length === before) break;
          } catch (error) { throw await this.withDiagnostics(error, page, 'search'); } finally { await page.close(); }
          pageNumber += 1;
        }
      }
    }
    return jobs.slice(0, limit);
  }

  async readJob(url: URL): Promise<Job> {
    const normalizedUrl = normalizeWuzzufUrl(url.href, this.baseUrl); const page = await this.newPage(this.headless);
    try { await this.goto(page, normalizedUrl); return normalizeJob(parseWuzzufJobHtml(await page.content(), normalizedUrl, this.baseUrl)); }
    catch (error) { throw await this.withDiagnostics(error, page, 'job-details'); } finally { await page.close(); }
  }

  async startApplication(job: Job, context: AdapterContext): Promise<{ id: string; url: string }> {
    context.signal.throwIfAborted(); const auth = await this.authenticationStatus(context.signal);
    if (!auth.authenticated) throw new WuzzufToolError(auth.code, auth.code === 'WUZZUF_CHALLENGE_REQUIRED' ? 'Complete the Wuzzuf challenge manually' : 'Open the Wuzzuf login browser and sign in', { status: auth.code === 'WUZZUF_LOGIN_REQUIRED' ? 401 : 409 });
    const page = await this.newPage(this.headless); try {
      await this.goto(page, normalizeWuzzufUrl(job.url, this.baseUrl), context.signal); await this.assertSafePage(page);
      const apply = await firstExisting(page, wuzzufSelectors.applyButton); if (!apply) throw new WuzzufToolError('WUZZUF_APPLICATION_UNAVAILABLE', 'This job is not accepting applications', { status: 409 });
      await apply.click(); await page.waitForLoadState('domcontentloaded', { timeout: this.timeoutMs }).catch(() => undefined); await this.assertSafePage(page);
      const id = randomUUID(); this.applications.set(id, { page, context: page.context() }); return { id, url: page.url() };
    } catch (error) { await page.close(); throw await this.withDiagnostics(error, page, 'start-application'); }
  }

  async collectFields(session: { id: string }): Promise<FormField[]> {
    const page = this.page(session.id); await this.assertSafePage(page); const form = await firstExisting(page, wuzzufSelectors.form); if (!form) throw new WuzzufToolError('WUZZUF_UNSUPPORTED_LAYOUT', 'Application form was not found', { retryable: true });
    return form.locator('input, select, textarea').evaluateAll((nodes) => nodes.filter((node) => !(node instanceof HTMLInputElement) || !['hidden', 'submit', 'button'].includes(node.type)).map((node, index) => {
      const el = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; const id = el.id || el.name || `field-${index}`; const labelled = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : undefined; const wrapping = el.closest('label')?.textContent; const label = (labelled || el.getAttribute('aria-label') || wrapping || el.name || id).replace(/\s+/g, ' ').trim();
      const rawType = el instanceof HTMLSelectElement ? 'select' : el instanceof HTMLInputElement ? el.type : 'text'; const supported = ['email', 'tel', 'select', 'radio', 'checkbox', 'file'].includes(rawType) ? rawType : 'text';
      return { id, label, type: supported, required: el.required, ...(el instanceof HTMLSelectElement ? { options: Array.from(el.options).map((option) => option.text.trim()).filter(Boolean) } : {}) };
    })) as Promise<FormField[]>;
  }

  async fillFields(session: { id: string }, answers: FieldAnswer[], context: AdapterContext): Promise<{ filled: string[]; skipped: string[] }> {
    context.signal.throwIfAborted(); const page = this.page(session.id); const filled: string[] = []; const skipped: string[] = [];
    for (const answer of answers) {
      context.signal.throwIfAborted(); if (!answer.value || answer.confirmationRequired || answer.confidence < 0.8) { skipped.push(answer.label); continue; }
      const locator = page.getByLabel(answer.label, { exact: true }); if (await locator.count() !== 1) { skipped.push(answer.label); continue; }
      if (!context.dryRun) { const tag = await locator.evaluate((element) => element.tagName); const type = await locator.getAttribute('type'); if (tag === 'SELECT') await locator.selectOption({ label: answer.value }); else if (type === 'checkbox' || type === 'radio') { if (/^(yes|true|checked)$/i.test(answer.value)) await locator.check(); } else await locator.fill(answer.value); }
      filled.push(answer.label);
    }
    return { filled, skipped };
  }

  async uploadApprovedFile(session: { id: string }, file: ApprovedFile): Promise<{ uploaded: boolean }> {
    if (!file.approved) throw new WuzzufToolError('WUZZUF_RESUME_NOT_APPROVED', 'Resume must be explicitly approved'); const page = this.page(session.id); const input = page.locator('input[type="file"]').first(); if (!await input.count()) return { uploaded: false }; if (file.content) { const name = file.sourceName ?? 'approved-resume.pdf'; await input.setInputFiles({ name, mimeType: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/plain', buffer: Buffer.from(file.content) }); } else if (file.path) await input.setInputFiles(file.path); else throw new WuzzufToolError('WUZZUF_RESUME_DATA_MISSING', 'Approved resume data is unavailable', { status: 409 }); return { uploaded: true };
  }

  async validate(session: { id: string }): Promise<{ valid: boolean; errors: string[] }> {
    const page = this.page(session.id); await this.assertSafePage(page); const errors = await page.locator('[role="alert"], [aria-invalid="true"], .validation-error').allTextContents(); const invalid = await page.locator('form :invalid').count(); return { valid: invalid === 0 && errors.length === 0, errors: [...errors.map(clean), ...(invalid ? [`${invalid} invalid fields`] : [])].filter(Boolean) };
  }

  async submit(session: { id: string }, context: AdapterContext): Promise<{ submitted: boolean; confirmation?: string }> {
    context.signal.throwIfAborted(); if (context.dryRun) throw new WuzzufToolError('WUZZUF_DRY_RUN_BLOCKED', 'Submission is disabled in dry-run mode', { status: 409 }); const page = this.page(session.id); const validation = await this.validate(session); if (!validation.valid) throw new WuzzufToolError('WUZZUF_VALIDATION_FAILED', 'Application form is not valid', { status: 409, diagnostics: { errors: validation.errors } });
    const button = await firstExisting(page, wuzzufSelectors.submitButton); if (!button) throw new WuzzufToolError('WUZZUF_UNSUPPORTED_LAYOUT', 'Submit button was not found', { retryable: true }); await button.click(); await page.waitForLoadState('domcontentloaded', { timeout: this.timeoutMs }).catch(() => undefined); await this.assertSafePage(page); const confirmation = clean(await page.locator('[role="status"], [data-testid="application-success"], main h1').first().textContent() ?? ''); return { submitted: true, ...(confirmation ? { confirmation } : {}) };
  }

  async screenshot(sessionId: string, label: string): Promise<string> { const page = this.page(sessionId); await mkdir(this.screenshotDir, { recursive: true }); const filename = `${sessionId}-${label.replace(/[^a-z0-9-]/gi, '-')}-${Date.now()}.png`; const path = resolve(this.screenshotDir, filename); await page.screenshot({ path, fullPage: true }); return filename; }
  async cancel(sessionId: string): Promise<void> { const item = this.applications.get(sessionId); if (!item) return; this.applications.delete(sessionId); await item.page.close().catch(() => undefined); }
  async close(): Promise<void> { await Promise.all([...this.applications.keys()].map((id) => this.cancel(id))); await this.closePersistentContext(); }

  private async newPage(headless: boolean): Promise<Page> { const context = await this.context(headless); const page = await context.newPage(); page.setDefaultTimeout(this.timeoutMs); return page; }
  private async context(headless: boolean): Promise<BrowserContext> { if (this.persistentContext && this.persistentHeadless === headless) return this.persistentContext; await this.closePersistentContext(); await mkdir(this.dataDir, { recursive: true }); this.persistentContext = await chromium.launchPersistentContext(this.dataDir, { headless, acceptDownloads: false, viewport: { width: 1440, height: 1000 } }); this.persistentHeadless = headless; return this.persistentContext; }
  private async closePersistentContext(): Promise<void> { if (this.persistentContext) await this.persistentContext.close().catch(() => undefined); this.persistentContext = undefined; this.persistentHeadless = undefined; }
  private page(id: string): Page { const item = this.applications.get(id); if (!item) throw new WuzzufToolError('WUZZUF_APPLICATION_SESSION_NOT_FOUND', 'Application browser session is not active', { status: 404 }); return item.page; }
  private async goto(page: Page, value: string, signal?: AbortSignal): Promise<void> { signal?.throwIfAborted(); const onAbort = () => page.close().catch(() => undefined); signal?.addEventListener('abort', onAbort, { once: true }); try { await page.goto(normalizeWuzzufUrl(value, this.baseUrl), { waitUntil: 'domcontentloaded', timeout: this.timeoutMs }); signal?.throwIfAborted(); normalizeWuzzufUrl(page.url(), this.baseUrl); await this.assertSafePage(page); } finally { signal?.removeEventListener('abort', onAbort); } }
  private async assertSafePage(page: Page): Promise<void> { const state = detectWuzzufPageState(await page.content()); if (state === 'challenge') throw new WuzzufToolError('WUZZUF_CHALLENGE_REQUIRED', 'Wuzzuf requires manual challenge completion', { status: 409 }); if (state === 'login_required') throw new WuzzufToolError('WUZZUF_LOGIN_REQUIRED', 'Wuzzuf login is required', { status: 401 }); normalizeWuzzufUrl(page.url(), this.baseUrl); }
  private async withDiagnostics(error: unknown, page: Page, operation: string): Promise<Error> { if (error instanceof WuzzufToolError && error.diagnostics) return error; let screenshot: string | undefined; try { await mkdir(this.screenshotDir, { recursive: true }); screenshot = `${operation}-${Date.now()}.png`; await page.screenshot({ path: resolve(this.screenshotDir, screenshot), fullPage: true }); } catch { /* diagnostics must not mask the original error */ } if (error instanceof WuzzufToolError) return new WuzzufToolError(error.code, error.message, { status: error.status, retryable: error.retryable, diagnostics: { ...(error.diagnostics ?? {}), operation, screenshot } }); return new WuzzufToolError('WUZZUF_BROWSER_ERROR', error instanceof Error ? error.message : 'Wuzzuf browser operation failed', { status: 502, retryable: true, diagnostics: { operation, screenshot } }); }
}

async function firstExisting(page: Page, selectors: readonly string[]) { for (const selector of selectors) { const locator = page.locator(selector).first(); if (await locator.count()) return locator; } return undefined; }
async function countAny(page: Page, selectors: readonly string[]): Promise<number> { let count = 0; for (const selector of selectors) count += await page.locator(selector).count(); return count; }
function clean(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
