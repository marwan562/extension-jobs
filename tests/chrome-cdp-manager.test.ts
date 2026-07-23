import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Browser, BrowserContext, Page } from 'playwright';
import { ChromeCdpManager, type BrowserConnectionManager } from '../packages/site-adapters/src/chrome-cdp-manager.ts';
import { WuzzufAdapter } from '../packages/site-adapters/src/wuzzuf-adapter.ts';
import { WuzzufToolError } from '../packages/shared/src/wuzzuf.ts';
import { loadOrchestratorConfig } from '../apps/orchestrator/src/config.ts';

function fakePage(html = '<html><body>Login</body></html>') {
  let closed = false; let frontCount = 0; const navigations: string[] = [];
  const page = { isClosed: () => closed, setDefaultTimeout: () => undefined, goto: async (url: string) => { navigations.push(url); }, content: async () => html, bringToFront: async () => { frontCount += 1; }, close: async () => { closed = true; } } as unknown as Page;
  return { page, navigations, frontCount: () => frontCount };
}

function fakeBrowser(contexts: BrowserContext[]) {
  let closeCount = 0; let disconnected: (() => void) | undefined;
  const browser = { isConnected: () => true, contexts: () => contexts, on: (event: string, callback: () => void) => { if (event === 'disconnected') disconnected = callback; }, close: async () => { closeCount += 1; } } as unknown as Browser;
  return { browser, closeCount: () => closeCount, disconnectEvent: () => disconnected?.() };
}

test('CDP manager reuses the first existing context and opens a new tab in it', async () => {
  const created = fakePage(); let newPageCount = 0;
  const first = { newPage: async () => { newPageCount += 1; return created.page; } } as unknown as BrowserContext;
  const second = {} as BrowserContext; const connected = fakeBrowser([first, second]); let endpoint = '';
  const manager = new ChromeCdpManager({ endpoint: 'http://127.0.0.1:9333', connectOverCDP: async (value) => { endpoint = value; return connected.browser; } });
  assert.equal(await manager.connect(), first);
  assert.equal(await manager.connect(), first);
  await manager.openTab('https://wuzzuf.net/login');
  assert.equal(endpoint, 'http://127.0.0.1:9333'); assert.equal(newPageCount, 1); assert.deepEqual(created.navigations, ['https://wuzzuf.net/login']);
});

test('CDP connection failures and missing contexts are actionable', async () => {
  const unavailable = new ChromeCdpManager({ connectOverCDP: async () => { throw new Error('connection refused with secret transport details'); } });
  await assert.rejects(unavailable.connect(), (error: unknown) => error instanceof WuzzufToolError && error.code === 'CHROME_CDP_UNAVAILABLE' && /remote debugging enabled/.test(error.message) && !/secret transport/.test(error.message));
  const empty = fakeBrowser([]); const noContext = new ChromeCdpManager({ connectOverCDP: async () => empty.browser });
  await assert.rejects(noContext.connect(), (error: unknown) => error instanceof WuzzufToolError && error.code === 'CHROME_CDP_NO_CONTEXT' && /normal Chrome window/.test(error.message));
});

test('CDP shutdown never calls browser.close on the user browser', async () => {
  const connected = fakeBrowser([{} as BrowserContext]); const manager = new ChromeCdpManager({ connectOverCDP: async () => connected.browser });
  await manager.connect(); await manager.disconnect(); assert.equal(connected.closeCount(), 0); assert.equal(manager.status(), 'not_connected');
});

test('CDP manager reports an unexpected Chrome disconnect', async () => {
  const connected = fakeBrowser([{} as BrowserContext]); const manager = new ChromeCdpManager({ connectOverCDP: async () => connected.browser });
  await manager.connect(); connected.disconnectEvent(); assert.equal(manager.status(), 'disconnected');
});

test('opening a tab reports when the user closes it during navigation', async () => {
  const tab = fakePage(); const page = tab.page as unknown as { goto(url: string): Promise<void>; close(): Promise<void> };
  page.goto = async () => { await page.close(); throw new Error('target closed with internal CDP details'); };
  const context = { newPage: async () => tab.page } as unknown as BrowserContext; const connected = fakeBrowser([context]);
  const manager = new ChromeCdpManager({ connectOverCDP: async () => connected.browser });
  await assert.rejects(manager.openTab('https://wuzzuf.net/login'), (error: unknown) => error instanceof WuzzufToolError && error.code === 'WUZZUF_TAB_CLOSED' && !/internal CDP/.test(error.message));
});

class LoginManager implements BrowserConnectionManager {
  readonly tab; openCount = 0; disconnectCount = 0;
  constructor(html = '<html><body>Wuzzuf login</body></html>') { this.tab = fakePage(html); }
  async connect(): Promise<BrowserContext> { throw new Error('not used'); }
  async openTab(url: string) { this.openCount += 1; await this.tab.page.goto(url); return this.tab.page; }
  async disconnect() { this.disconnectCount += 1; }
  isConnected() { return true; }
  status(): 'connected' { return 'connected'; }
}

test('Wuzzuf login uses one managed tab and debounces duplicate requests', async () => {
  const browserManager = new LoginManager(); const adapter = new WuzzufAdapter({ browserManager });
  const [first, duplicate] = await Promise.all([adapter.openLogin(), adapter.openLogin()]); const reused = await adapter.openLogin();
  assert.equal(first.reused, false); assert.equal(duplicate.reused, false); assert.equal(reused.reused, true); assert.equal(browserManager.openCount, 1); assert.equal(browserManager.tab.frontCount(), 1);
  await adapter.close(); assert.equal(browserManager.disconnectCount, 1);
});

test('Wuzzuf challenge detection returns manual-verification-required and keeps the managed tab open', async () => {
  const browserManager = new LoginManager('<html><title>Just a moment...</title><body>Verify you are human</body></html>'); const adapter = new WuzzufAdapter({ browserManager });
  const result = await adapter.openLogin(); assert.equal(result.status, 'manual_verification_required'); assert.equal(browserManager.tab.page.isClosed(), false);
});

test('production Wuzzuf browser code uses CDP and never creates a browser context', async () => {
  const [adapter, manager] = await Promise.all([readFile('packages/site-adapters/src/wuzzuf-adapter.ts', 'utf8'), readFile('packages/site-adapters/src/chrome-cdp-manager.ts', 'utf8')]);
  assert.match(manager, /chromium\.connectOverCDP/); assert.doesNotMatch(adapter, /newContext\(|launchPersistentContext|chromium\.launch/); assert.doesNotMatch(manager, /newContext\(|launchPersistentContext|chromium\.launch/);
});

test('orchestrator configuration defaults and validates the CDP endpoint at startup', () => {
  const base = { DEV_ORIGIN: 'http://127.0.0.1:9999' };
  assert.equal(loadOrchestratorConfig(base).CHROME_CDP_ENDPOINT, 'http://127.0.0.1:9222');
  assert.throws(() => loadOrchestratorConfig({ ...base, CHROME_CDP_ENDPOINT: 'file:///tmp/chrome' }), /CHROME_CDP_ENDPOINT/);
  assert.throws(() => loadOrchestratorConfig({ ...base, CHROME_CDP_ENDPOINT: 'https://remote-browser.example' }), /loopback/);
  assert.throws(() => loadOrchestratorConfig({ ...base, CHROME_CDP_ENDPOINT: 'ws://user:pass@127.0.0.1:9222' }), /credential-free/);
  assert.throws(() => loadOrchestratorConfig({ ...base, JOB_SOURCE_MODE: 'wuzuf' }), /Unsupported JOB_SOURCE_MODE/);
  assert.throws(() => loadOrchestratorConfig({ ...base, JOB_SOURCE_MODE: 'composio' }), /COMPOSIO_LINKEDIN_SEARCH_TOOL/);
  assert.throws(() => loadOrchestratorConfig({ ...base, JOB_SOURCE_MODE: 'wuzzuf, indeed' }), /WORKER_TOOL_TOKEN/);
  assert.equal(loadOrchestratorConfig({ ...base, JOB_SOURCE_MODE: 'wuzzuf, indeed', WORKER_TOOL_TOKEN: 'worker-token-with-at-least-32-characters' }).JOB_SOURCE_MODE, 'wuzzuf,indeed');
});
