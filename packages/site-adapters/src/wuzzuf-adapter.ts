import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import type { FieldAnswer, Job, RawJob } from '../../shared/src/domain.ts';
import { normalizeJob } from '../../shared/src/jobs.ts';
import { WuzzufToolError, type WuzzufSearchInput } from '../../shared/src/wuzzuf.ts';
import type { AdapterContext, ApprovedFile, FormField, JobSiteAdapter, JobSource } from './index.ts';
import { detectWuzzufPageState, normalizeWuzzufUrl, parseWuzzufJobHtml, parseWuzzufSearchHtml } from './wuzzuf-parser.ts';
import { wuzzufSelectors } from './wuzzuf-selectors.ts';
import { ChromeCdpManager, type BrowserConnectionManager } from './chrome-cdp-manager.ts';

export interface WuzzufAdapterOptions {
  browserManager?: BrowserConnectionManager;
  cdpEndpoint?: string;
  /** @deprecated CDP mode reuses Chrome's profile; retained for test/config compatibility only. */
  dataDir?: string;
  baseUrl?: string;
  /** @deprecated Production Wuzzuf always uses the visible connected Chrome window. */
  headless?: boolean;
  /** @deprecated CDP mode does not launch a browser channel. */
  browserChannel?: string;
  /** @deprecated CDP mode does not launch an executable. */
  executablePath?: string;
  navigationTimeoutMs?: number;
  screenshotDir?: string;
}

interface ApplicationPage { page: Page }

export class WuzzufJobSource implements JobSource {
  readonly id = 'wuzzuf';
  private readonly adapter: WuzzufAdapter;
  constructor(adapter?: WuzzufAdapter) { this.adapter = adapter ?? new WuzzufAdapter(); }
  discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> { return this.adapter.discover(criteria); }
}

export class WuzzufAdapter implements JobSiteAdapter {
  readonly id = 'wuzzuf';
  private readonly applications = new Map<string, ApplicationPage>();
  private readonly browserManager: BrowserConnectionManager;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly screenshotDir: string;
  private loginPage: Page | undefined;
  private manualVerificationPage: Page | undefined;
  private openLoginPromise: Promise<{ opened: true; reused: boolean; status: 'login_opened' | 'manual_verification_required'; message: string }> | undefined;

  constructor(options: WuzzufAdapterOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? process.env.WUZZUF_BASE_URL ?? 'https://wuzzuf.net').origin;
    this.timeoutMs = options.navigationTimeoutMs ?? Number(process.env.WUZZUF_NAVIGATION_TIMEOUT_MS ?? 60_000);
    this.screenshotDir = resolve(options.screenshotDir ?? process.env.WUZZUF_SCREENSHOT_DIR ?? '.data/wuzzuf-diagnostics');
    this.browserManager = options.browserManager ?? new ChromeCdpManager({ ...(options.cdpEndpoint ? { endpoint: options.cdpEndpoint } : {}), navigationTimeoutMs: this.timeoutMs });
  }

  matches(url: URL): boolean { try { return normalizeWuzzufUrl(url.href, this.baseUrl) === normalizeWuzzufUrl(url.href, this.baseUrl); } catch { return false; } }
  normalizeUrl(value: string): string { return normalizeWuzzufUrl(value, this.baseUrl); }

  async authenticate(context: AdapterContext): Promise<{ status: 'authenticated' | 'handoff_required'; reason?: string }> {
    context.signal.throwIfAborted(); const state = await this.authenticationStatus(context.signal);
    return state.authenticated ? { status: 'authenticated' } : { status: 'handoff_required', reason: state.code };
  }

  async authenticationStatus(signal?: AbortSignal): Promise<{ authenticated: boolean; code: 'AUTHENTICATED' | 'WUZZUF_LOGIN_REQUIRED' | 'WUZZUF_CHALLENGE_REQUIRED' }> {
    const page = await this.newPage(); let keepOpen = false; try {
      await this.goto(page, new URL('/explore', this.baseUrl).href, signal);
      await Promise.race([
        page.waitForSelector('a[href*="/applications"]', { state: 'attached', timeout: 5000 }),
        page.waitForSelector('a:has-text("Applications")', { state: 'attached', timeout: 5000 }),
        page.waitForSelector('a:has-text("Login")', { state: 'attached', timeout: 5000 }),
        page.waitForSelector('button:has-text("Sign in")', { state: 'attached', timeout: 5000 }),
        page.waitForSelector('input[type="password"]', { state: 'attached', timeout: 5000 })
      ]).catch(() => undefined);
      const state = detectWuzzufPageState(await page.content());
      if (state === 'challenge') return { authenticated: false, code: 'WUZZUF_CHALLENGE_REQUIRED' };
      const authenticatedMarker = await countAny(page, wuzzufSelectors.authenticatedMarker);
      const loginMarker = await countAny(page, wuzzufSelectors.loginMarker);
      return authenticatedMarker > 0 && loginMarker === 0 ? { authenticated: true, code: 'AUTHENTICATED' } : { authenticated: false, code: 'WUZZUF_LOGIN_REQUIRED' };
    } catch (error) {
      if (isChallenge(error)) { this.manualVerificationPage = page; keepOpen = true; return { authenticated: false, code: 'WUZZUF_CHALLENGE_REQUIRED' }; }
      throw this.browserError(error, page);
    } finally { if (!keepOpen) await page.close().catch(() => undefined); }
  }

  async openLogin(): Promise<{ opened: true; reused: boolean; status: 'login_opened' | 'manual_verification_required'; message: string }> {
    if (this.openLoginPromise) return this.openLoginPromise;
    this.openLoginPromise = this.openOrReuseLogin();
    try { return await this.openLoginPromise; } finally { this.openLoginPromise = undefined; }
  }

  async discover(criteria: WuzzufSearchInput | { queries: string[]; locations: string[] }): Promise<RawJob[]> {
    const input = criteria as WuzzufSearchInput; const limit = Math.max(1, Math.min(input.limit ?? 25, 100)); const seen = new Set<string>(); const jobs: RawJob[] = [];
    for (const query of input.queries) {
      for (const location of input.locations) {
        let pageNumber = 0;
        while (jobs.length < limit && pageNumber < 10) {
          const search = new URL('/search/jobs', this.baseUrl); search.searchParams.set('q', query); search.searchParams.set('l', location); if (pageNumber) search.searchParams.set('start', String(pageNumber));
          const page = await this.newPage(); let keepOpen = false; try {
            await this.goto(page, search.href);
            await this.waitForSearchResults(page);
            const parsed = parseWuzzufSearchHtml(await page.content(), this.baseUrl); const before = jobs.length;
            for (const job of parsed) {
              if (seen.has(job.sourceId) || (input.remote === true && !job.remote) || (input.experienceLevel && job.experienceLevel !== input.experienceLevel.toLowerCase()) || (input.employmentTypes?.length && !input.employmentTypes.map((value) => value.toLowerCase()).includes(job.employmentType ?? ''))) continue;
              seen.add(job.sourceId); jobs.push(job); if (jobs.length >= limit) break;
            }
            if (parsed.length === 0 || jobs.length === before) break;
          } catch (error) { keepOpen = this.keepForManualVerification(error, page); throw await this.withDiagnostics(error, page, 'search'); } finally { if (!keepOpen) await page.close().catch(() => undefined); }
          pageNumber += 1;
        }
      }
    }
    return jobs.slice(0, limit);
  }

  async readJob(url: URL): Promise<Job> {
    const normalizedUrl = normalizeWuzzufUrl(url.href, this.baseUrl); const page = await this.newPage(); let keepOpen = false;
    try { await this.goto(page, normalizedUrl); return normalizeJob(parseWuzzufJobHtml(await page.content(), normalizedUrl, this.baseUrl)); }
    catch (error) { keepOpen = this.keepForManualVerification(error, page); throw await this.withDiagnostics(error, page, 'job-details'); } finally { if (!keepOpen) await page.close().catch(() => undefined); }
  }

  async startApplication(job: Job, context: AdapterContext): Promise<{ id: string; url: string }> {
    context.signal.throwIfAborted(); const auth = await this.authenticationStatus(context.signal);
    if (!auth.authenticated) throw new WuzzufToolError(auth.code, auth.code === 'WUZZUF_CHALLENGE_REQUIRED' ? 'Complete the Wuzzuf challenge manually' : 'Open the Wuzzuf login browser and sign in', { status: auth.code === 'WUZZUF_LOGIN_REQUIRED' ? 401 : 409 });
    const page = await this.newPage(); try {
      await this.goto(page, normalizeWuzzufUrl(job.url, this.baseUrl), context.signal); await this.assertSafePage(page);
      await Promise.race([
        page.waitForSelector('button:has-text("Apply for Job")', { state: 'attached', timeout: 8000 }),
        page.waitForSelector('a:has-text("Apply for Job")', { state: 'attached', timeout: 8000 }),
        page.waitForSelector('button:has-text("Apply")', { state: 'attached', timeout: 8000 }),
        page.waitForSelector('[data-testid="apply-button"]', { state: 'attached', timeout: 8000 })
      ]).catch(() => undefined);
      const apply = await firstExisting(page, wuzzufSelectors.applyButton); if (!apply) throw new WuzzufToolError('WUZZUF_APPLICATION_UNAVAILABLE', 'This job is not accepting applications', { status: 409 });
      let clicked = false;
      for (const selector of wuzzufSelectors.applyButton) {
        const locator = page.locator(selector);
        const count = await locator.count();
        for (let i = 0; i < count; i++) {
          try {
            const item = locator.nth(i);
            if (await item.isVisible()) {
              await item.click({ timeout: 5000 });
              clicked = true;
              break;
            }
          } catch {
            // try next
          }
        }
        if (clicked) break;
      }
      if (!clicked) await apply.click();
      await page.waitForLoadState('domcontentloaded', { timeout: this.timeoutMs }).catch(() => undefined); await this.assertSafePage(page);
      const id = randomUUID(); this.applications.set(id, { page }); return { id, url: page.url() };
    } catch (error) { const diag = await this.withDiagnostics(error, page, 'start-application'); if (!this.keepForManualVerification(error, page)) await page.close().catch(() => undefined); throw diag; }
  }

  async collectFields(session: { id: string }): Promise<FormField[]> {
    const page = this.page(session.id); await this.assertSafePage(page);
    await Promise.race([
      page.waitForSelector('form[aria-label*="application" i]', { state: 'attached', timeout: 5000 }),
      page.waitForSelector('form:has(button:has-text("Submit"))', { state: 'attached', timeout: 5000 }),
      page.waitForSelector('form[action="#"]', { state: 'attached', timeout: 5000 }),
      page.waitForSelector('form:not([action*="search"])', { state: 'attached', timeout: 5000 })
    ]).catch(() => undefined);
    const form = await firstExisting(page, wuzzufSelectors.form); if (!form) throw new WuzzufToolError('WUZZUF_UNSUPPORTED_LAYOUT', 'Application form was not found', { retryable: true });
    return form.locator('input, select, textarea').evaluateAll((nodes) => nodes.filter((node) => !(node instanceof HTMLInputElement) || !['hidden', 'submit', 'button'].includes(node.type)).map((node, index) => {
      const el = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const id = `field-${index}`;
      
      let questionText = '';
      let current = el.parentElement;
      while (current && current.tagName !== 'FORM') {
        let sibling = current.previousElementSibling;
        while (sibling) {
          if (sibling.classList.contains('css-11rcwxl') || sibling.querySelector('.etjvxgw3') || sibling.tagName === 'LABEL') {
            questionText = sibling.textContent || '';
            break;
          }
          sibling = sibling.previousElementSibling;
        }
        if (questionText) break;
        current = current.parentElement;
      }
      questionText = questionText.replace(/\s+/g, ' ').trim();

      const labelled = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : undefined;
      const wrapping = el.closest('label')?.textContent;
      let label = (labelled || el.getAttribute('aria-label') || wrapping || el.name || id).replace(/\s+/g, ' ').trim();

      if (questionText && questionText !== label) {
        if (el.type === 'radio' || el.type === 'checkbox') {
          label = `${questionText} [Option: ${label}]`;
        } else {
          label = questionText;
        }
      }

      const rawType = el instanceof HTMLSelectElement ? 'select' : el instanceof HTMLInputElement ? el.type : 'text';
      const supported = ['email', 'tel', 'select', 'radio', 'checkbox', 'file'].includes(rawType) ? rawType : 'text';
      return { id, label, type: supported, required: el.required, ...(el instanceof HTMLSelectElement ? { options: Array.from(el.options).map((option) => option.text.trim()).filter(Boolean) } : {}) };
    })) as Promise<FormField[]>;
  }

  async fillFields(session: { id: string }, answers: FieldAnswer[], context: AdapterContext): Promise<{ filled: string[]; skipped: string[] }> {
    context.signal.throwIfAborted(); const page = this.page(session.id); const filled: string[] = []; const skipped: string[] = [];
    const form = await firstExisting(page, wuzzufSelectors.form);
    if (!form) return { filled, skipped };
    const inputs = form.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
    for (const answer of answers) {
      context.signal.throwIfAborted(); if (!answer.value || answer.confirmationRequired || answer.confidence < 0.8) { skipped.push(answer.label); continue; }
      const match = answer.fieldId?.match(/^field-(\d+)$/);
      if (!match) { skipped.push(answer.label); continue; }
      const index = parseInt(match[1]!, 10);
      const locator = inputs.nth(index);
      if (await locator.count() !== 1) { skipped.push(answer.label); continue; }
      if (!context.dryRun) {
        const tag = await locator.evaluate((element) => element.tagName);
        const type = await locator.getAttribute('type');
        if (tag === 'SELECT' && answer.value) {
          await locator.selectOption({ label: answer.value as string });
        } else if (type === 'checkbox' || type === 'radio') {
          if (answer.value && /^(yes|true|checked)$/i.test(answer.value)) {
            await locator.evaluate((el) => {
              const input = el as HTMLInputElement;
              const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
              if (valueSetter) {
                valueSetter.call(input, true);
              } else {
                input.checked = true;
              }
              input.dispatchEvent(new Event('click', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            });
          }
        } else if (answer.value) {
          await locator.fill(answer.value as string);
        }
      }
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
    const button = await firstExisting(page, wuzzufSelectors.submitButton); if (!button) throw new WuzzufToolError('WUZZUF_UNSUPPORTED_LAYOUT', 'Submit button was not found', { retryable: true }); await button.click(); await page.waitForLoadState('domcontentloaded', { timeout: this.timeoutMs }).catch(() => undefined); await this.assertSafePage(page); const success = page.locator('[role="status"], [data-testid="application-success"], main h1').first(); const confirmation = await success.count() ? clean(await success.textContent() ?? '') : ''; if (!confirmation && page.url().includes('/job-questions/')) throw new WuzzufToolError('WUZZUF_SUBMISSION_UNCONFIRMED', 'Wuzzuf kept the application form open without a success confirmation', { retryable: true }); return { submitted: true, ...(confirmation ? { confirmation } : {}) };
  }

  async screenshot(sessionId: string, label: string): Promise<string> { const page = this.page(sessionId); await mkdir(this.screenshotDir, { recursive: true }); const filename = `${sessionId}-${label.replace(/[^a-z0-9-]/gi, '-')}-${Date.now()}.png`; const path = resolve(this.screenshotDir, filename); await page.screenshot({ path, fullPage: true }); return filename; }
  async cancel(sessionId: string): Promise<void> { const item = this.applications.get(sessionId); if (!item) return; this.applications.delete(sessionId); await item.page.close().catch(() => undefined); }
  async close(): Promise<void> { await Promise.all([...this.applications.keys()].map((id) => this.cancel(id))); this.loginPage = undefined; this.manualVerificationPage = undefined; await this.browserManager.disconnect(); }
  hasActiveApplications(): boolean { return this.applications.size > 0; }
  async disconnect(): Promise<void> { if (this.hasActiveApplications()) throw new WuzzufToolError('WUZZUF_ACTIVE_APPLICATIONS', 'Cancel active Wuzzuf applications before disconnecting.', { status: 409, actionRequired: 'Cancel the active applications, then retry disconnect.' }); this.loginPage = undefined; this.manualVerificationPage = undefined; await this.browserManager.disconnect(); }

  browserStatus() { return { status: this.browserManager.status() }; }
  private async openOrReuseLogin(): Promise<{ opened: true; reused: boolean; status: 'login_opened' | 'manual_verification_required'; message: string }> {
    if (this.loginPage && !this.loginPage.isClosed()) {
      await this.loginPage.bringToFront();
      const status = detectWuzzufPageState(await this.loginPage.content()) === 'challenge' ? 'manual_verification_required' : 'login_opened';
      return { opened: true, reused: true, status, message: status === 'manual_verification_required' ? 'Complete the security verification manually in the open Wuzzuf tab, then retry.' : 'Complete login in the open Wuzzuf tab, then check status again.' };
    }
    if (this.manualVerificationPage && !this.manualVerificationPage.isClosed()) {
      this.loginPage = this.manualVerificationPage; this.manualVerificationPage = undefined;
      await this.loginPage.bringToFront();
      return { opened: true, reused: true, status: 'manual_verification_required', message: 'Complete the security verification manually in the open Wuzzuf tab, then retry.' };
    }
    try {
      this.loginPage = await this.browserManager.openTab(new URL('/login', this.baseUrl).href);
      const status = detectWuzzufPageState(await this.loginPage.content()) === 'challenge' ? 'manual_verification_required' : 'login_opened';
      return { opened: true, reused: false, status, message: status === 'manual_verification_required' ? 'Complete the security verification manually in the open Wuzzuf tab, then retry.' : 'Complete login in the new Wuzzuf tab, then check status again.' };
    } catch (error) {
      if (error instanceof WuzzufToolError) throw error;
      throw new WuzzufToolError('WUZZUF_BROWSER_ERROR', 'Unable to open the Wuzzuf login tab in Chrome. Check the CDP connection and retry.', { status: 502, retryable: true, cause: error });
    }
  }
  private async newPage(): Promise<Page> { if (this.manualVerificationPage && !this.manualVerificationPage.isClosed()) { const page = this.manualVerificationPage; this.manualVerificationPage = undefined; return page; } const context = await this.browserManager.connect(); const page = await context.newPage(); page.setDefaultTimeout(this.timeoutMs); return page; }
  private page(id: string): Page { const item = this.applications.get(id); if (!item) throw new WuzzufToolError('WUZZUF_APPLICATION_SESSION_NOT_FOUND', 'Application browser session is not active', { status: 404 }); if (!this.browserManager.isConnected() && this.browserManager.status() === 'disconnected') throw new WuzzufToolError('CHROME_CDP_DISCONNECTED', 'Chrome disconnected while a Wuzzuf task was running. Restart Chrome with remote debugging enabled, restart the orchestrator, and retry.', { status: 503, retryable: true }); if (item.page.isClosed()) { this.applications.delete(id); throw new WuzzufToolError('WUZZUF_TAB_CLOSED', 'The managed Wuzzuf application tab closed unexpectedly. Prepare the application again.', { status: 409, retryable: true }); } return item.page; }
  private async goto(page: Page, value: string, signal?: AbortSignal): Promise<void> { signal?.throwIfAborted(); if (page.isClosed()) throw new WuzzufToolError('WUZZUF_TAB_CLOSED', 'The Wuzzuf tab closed unexpectedly. Reopen it from the extension and retry.', { status: 409, retryable: true }); if (page.url() !== 'about:blank' && detectWuzzufPageState(await page.content()) === 'challenge') throw new WuzzufToolError('WUZZUF_CHALLENGE_REQUIRED', 'Manual verification is required in the open Wuzzuf tab. Complete it in Chrome, then retry.', { status: 409, retryable: true }); const onAbort = () => page.close().catch(() => undefined); signal?.addEventListener('abort', onAbort, { once: true }); try { await page.goto(normalizeWuzzufUrl(value, this.baseUrl), { waitUntil: 'domcontentloaded', timeout: this.timeoutMs }); signal?.throwIfAborted(); normalizeWuzzufUrl(page.url(), this.baseUrl); await this.assertSafePage(page); } catch (error) { throw this.browserError(error, page); } finally { signal?.removeEventListener('abort', onAbort); } }
  private async waitForSearchResults(page: Page): Promise<void> {
    const result = page.locator('a[href*="/jobs/p/"], a[href*="/internship/"]').first();
    const empty = page.getByText(/no jobs (?:found|match)|couldn't find any jobs|0 jobs found/i).first();
    await Promise.race([
      result.waitFor({ state: 'attached', timeout: this.timeoutMs }),
      empty.waitFor({ state: 'attached', timeout: this.timeoutMs }),
      page.waitForFunction(() => /captcha|verify you are human|performing security verification|security service to protect against malicious bots|unusual traffic|security check/i.test(document.body?.innerText ?? ''), undefined, { timeout: this.timeoutMs })
    ]).catch(() => undefined);
    await this.assertSafePage(page);
    if (!await result.count() && !await empty.count()) throw new WuzzufToolError('WUZZUF_SEARCH_TIMEOUT', 'Wuzzuf search did not finish loading. Open the visible Wuzzuf browser, complete any security check, and retry.', { status: 504, retryable: true });
  }
  private async assertSafePage(page: Page): Promise<void> { const state = detectWuzzufPageState(await page.content()); if (state === 'challenge') throw new WuzzufToolError('WUZZUF_CHALLENGE_REQUIRED', 'Manual verification is required in the open Wuzzuf tab. Complete it in Chrome, then retry.', { status: 409, retryable: true }); if (state === 'login_required') throw new WuzzufToolError('WUZZUF_LOGIN_REQUIRED', 'Wuzzuf login is required. Use “Open Wuzzuf login,” sign in in Chrome, then retry.', { status: 401, retryable: true }); normalizeWuzzufUrl(page.url(), this.baseUrl); }
  private keepForManualVerification(error: unknown, page: Page): boolean { if (!isChallenge(error) || page.isClosed()) return false; this.manualVerificationPage = page; void page.bringToFront().catch(() => undefined); return true; }
  private browserError(error: unknown, page: Page): Error { if (error instanceof WuzzufToolError) return error; if (!this.browserManager.isConnected() && this.browserManager.status() === 'disconnected') return new WuzzufToolError('CHROME_CDP_DISCONNECTED', 'Chrome disconnected while a Wuzzuf task was running. Restart Chrome with remote debugging enabled, restart the orchestrator, and retry.', { status: 503, retryable: true, cause: error }); if (page.isClosed()) return new WuzzufToolError('WUZZUF_TAB_CLOSED', 'The Wuzzuf tab closed unexpectedly. Reopen it from the extension and retry.', { status: 409, retryable: true }); return error instanceof Error ? error : new Error('Wuzzuf browser operation failed'); }
  private async withDiagnostics(error: unknown, page: Page, operation: string): Promise<Error> { const safeError = this.browserError(error, page); if (safeError instanceof WuzzufToolError && safeError.diagnostics) return safeError; let screenshot: string | undefined; try { if (!page.isClosed()) { await mkdir(this.screenshotDir, { recursive: true }); screenshot = `${operation}-${Date.now()}.png`; await page.screenshot({ path: resolve(this.screenshotDir, screenshot), fullPage: true }); } } catch { /* diagnostics must not mask the original error */ } if (safeError instanceof WuzzufToolError) return new WuzzufToolError(safeError.code, safeError.message, { status: safeError.status, retryable: safeError.retryable, diagnostics: { ...(safeError.diagnostics ?? {}), operation, ...(screenshot ? { screenshot } : {}) }, cause: safeError.cause }); return new WuzzufToolError('WUZZUF_BROWSER_ERROR', 'The Wuzzuf browser operation failed. Check the open Chrome tab and retry.', { status: 502, retryable: true, diagnostics: { operation, ...(screenshot ? { screenshot } : {}) }, cause: safeError }); }
}

async function firstExisting(root: Page, selectors: readonly string[]) {
  for (const selector of selectors) {
    const locator = root.locator(selector);
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);
      if (await item.isVisible()) {
        return item;
      }
    }
  }
  for (const selector of selectors) {
    const locator = root.locator(selector).first();
    if (await locator.count()) return locator;
  }
  return undefined;
}
async function countAny(page: Page, selectors: readonly string[]): Promise<number> { let count = 0; for (const selector of selectors) count += await page.locator(selector).count(); return count; }
function clean(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
function isChallenge(error: unknown): error is WuzzufToolError { return error instanceof WuzzufToolError && error.code === 'WUZZUF_CHALLENGE_REQUIRED'; }
