import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import type { ApplicationDestinationAdapter, ConnectorContext, DestinationDetection, FillApplicationRequest, FillApplicationResult, InspectApplicationRequest, SubmissionResult, SubmitApplicationRequest, ValidationResult, ValidateApplicationRequest } from '../../connector-sdk/src/index.ts';
import type { ApplicationForm, ConnectorCapabilities, ConnectorId } from '../../shared-contracts/src/index.ts';
import type { BrowserConnectionManager } from '../../site-adapters/src/chrome-cdp-manager.ts';
import { ChromeCdpManager } from '../../site-adapters/src/chrome-cdp-manager.ts';
import { canonicalizeFields, fingerprintForm } from '../../universal-form-engine/src/index.ts';
import type { InspectedField } from '../../universal-form-engine/src/index.ts';
import { defaultSitePolicyRegistry } from '../../site-policy-registry/src/index.ts';

const destinationIds = ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'workday'] as const;
type DestinationId = typeof destinationIds[number];

export class AtsBrowserAdapter implements ApplicationDestinationAdapter {
  readonly id: DestinationId; private readonly browser: BrowserConnectionManager; private readonly pages = new Map<string, Page>();
  constructor(id: DestinationId, browser: BrowserConnectionManager = new ChromeCdpManager()) { this.id = id; this.browser = browser; }
  async detect(url: URL): Promise<DestinationDetection> { const connector = defaultSitePolicyRegistry.connectorForHost(url.hostname); return { matched: connector === this.id, ...(connector === this.id ? { destination: { adapterId: this.id, url: url.href, detectedAt: new Date().toISOString(), confidence: 0.98, supported: true } } : {}) }; }
  async capabilities(_context: ConnectorContext): Promise<ConnectorCapabilities> { return defaultSitePolicyRegistry.get(this.id).capabilities; }
  async inspect(request: InspectApplicationRequest): Promise<ApplicationForm> {
    request.context.signal.throwIfAborted(); this.assertUrl(request.destination.url); const page = await this.page(request.destination.url); await assertSafePage(page);
    const inspected = await page.locator('form input, form select, form textarea').evaluateAll((nodes) => nodes.slice(0, 500).filter((node) => !['hidden', 'submit', 'button', 'reset'].includes((node as HTMLInputElement).type)).map((node, index) => { const element = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; const id = element.id || element.getAttribute('name') || `field-${index}`; const label = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim() : undefined; const text = label || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || id; const type = element instanceof HTMLSelectElement ? 'select' : element instanceof HTMLTextAreaElement ? 'textarea' : ['email', 'tel', 'number', 'radio', 'checkbox', 'file'].includes(element.type) ? element.type : 'text'; return { id, label: text, name: element.getAttribute('name') ?? undefined, autocomplete: element.getAttribute('autocomplete') ?? undefined, type, required: element.required, ...(element instanceof HTMLSelectElement ? { options: Array.from(element.options).map((option) => option.textContent?.trim() ?? '').filter(Boolean) } : {}), step: 0 }; }));
    const fields = canonicalizeFields(inspected as InspectedField[]); return { destination: request.destination, fields, fingerprint: fingerprintForm(request.destination.url, fields, `${this.id}:semantic-submit:v1`), stepCount: Math.max(1, ...fields.map((field) => field.step + 1)) };
  }
  async fill(request: FillApplicationRequest): Promise<FillApplicationResult> {
    request.context.signal.throwIfAborted(); this.assertUrl(request.form.destination.url); const current = await this.inspect({ destination: request.form.destination, context: request.context }); if (current.fingerprint.formVersion !== request.form.fingerprint.formVersion) throw new AtsAdapterError('FORM_CHANGED', 'Application form changed after review');
    const page = await this.page(request.form.destination.url); const filledFieldIds: string[] = []; const skippedFieldIds: string[] = [];
    for (const field of request.form.fields) { const value = request.answers[field.id]; if (value === undefined || value === '' || field.type === 'file') { skippedFieldIds.push(field.id); continue; } const locator = page.locator(`[id="${cssValue(field.id)}"], [name="${cssValue(field.id)}"]`); if (await locator.count() !== 1) { skippedFieldIds.push(field.id); continue; } if (!request.context.dryRun) { if (field.type === 'select') await locator.selectOption({ label: value }); else if (field.type === 'checkbox' || field.type === 'radio') { if (/^(true|yes|1|checked)$/i.test(value)) await locator.check(); else await locator.uncheck().catch(() => undefined); } else await locator.fill(value); } filledFieldIds.push(field.id); }
    return { filledFieldIds, skippedFieldIds, operationId: randomUUID() };
  }
  async validate(request: ValidateApplicationRequest): Promise<ValidationResult> { request.context.signal.throwIfAborted(); const current = await this.inspect({ destination: request.form.destination, context: request.context }); if (current.fingerprint.formVersion !== request.form.fingerprint.formVersion) return { valid: false, errors: [{ message: 'FORM_CHANGED' }] }; const page = await this.page(request.form.destination.url); const errors = await page.locator('form :invalid').evaluateAll((nodes) => nodes.slice(0, 100).map((node) => ({ fieldId: (node as HTMLInputElement).id || (node as HTMLInputElement).name || undefined, message: 'Required field is incomplete' }))); return { valid: errors.length === 0, errors };
  }
  async submit(request: SubmitApplicationRequest): Promise<SubmissionResult> {
    if (request.context.dryRun || !request.context.userPresent || !request.approvalId) throw new AtsAdapterError('APPROVAL_REQUIRED', 'A current trusted-UI approval is required'); const validation = await this.validate({ form: request.form, context: request.context }); if (!validation.valid) throw new AtsAdapterError('APPLICATION_INPUT_REQUIRED', 'Application is not valid');
    const page = await this.page(request.form.destination.url); await assertSafePage(page); const button = page.locator('form button[type="submit"], form input[type="submit"]').filter({ visible: true }).first(); if (await button.count() !== 1) throw new AtsAdapterError('AUTOMATION_NOT_PERMITTED', 'Reviewed submit control was not found'); await button.click({ noWaitAfter: true }); await page.waitForTimeout(750); const text = (await page.locator('body').innerText()).slice(0, 20_000); if (/application (received|submitted)|successfully applied|thank you for applying/i.test(text)) return { status: 'submitted' }; if (/already applied/i.test(text)) return { status: 'already_applied' }; return { status: 'verification_required' };
  }
  async cancelOperation(_operationId: string): Promise<void> { /* cancellation is driven by the worker signal; managed tabs remain available for review */ }
  async close(): Promise<void> { await Promise.all([...this.pages.values()].map((page) => page.close().catch(() => undefined))); this.pages.clear(); await this.browser.disconnect(); }
  private async page(url: string): Promise<Page> { const existing = this.pages.get(url); if (existing && !existing.isClosed()) return existing; const page = await this.browser.openTab(url); this.pages.set(url, page); return page; }
  private assertUrl(value: string): void { const url = new URL(value); const connector = defaultSitePolicyRegistry.connectorForHost(url.hostname); if (connector !== this.id || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new AtsAdapterError('AUTOMATION_NOT_PERMITTED', 'Destination URL is outside the reviewed adapter hosts'); }
}

export function createAtsAdapterRegistry(browser?: BrowserConnectionManager): ReadonlyMap<ConnectorId, AtsBrowserAdapter> { return new Map(destinationIds.map((id) => [id, new AtsBrowserAdapter(id, browser)])); }
export class AtsAdapterError extends Error { readonly code: string; constructor(code: string, message: string) { super(message); this.code = code; } }
async function assertSafePage(page: Page): Promise<void> { const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 50_000); const challenge = await page.locator('iframe[src*="captcha"], [class*="captcha" i]').count(); if (challenge || /verify you are human|security verification|unusual traffic|security check/i.test(text)) throw new AtsAdapterError('SECURITY_CHALLENGE_DETECTED', 'Manual security verification is required'); }
function cssValue(value: string): string { return value.replace(/["\\]/g, '\\$&'); }
