import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { WuzzufToolError } from '../../shared/src/wuzzuf.ts';

const DEFAULT_CDP_ENDPOINT = 'http://127.0.0.1:9222';
const DEFAULT_NAVIGATION_TIMEOUT_MS = 60_000;

export interface BrowserConnectionManager {
  connect(): Promise<BrowserContext>;
  openTab(url: string): Promise<Page>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  status(): 'connected' | 'disconnected' | 'not_connected';
}

export interface ChromeCdpManagerOptions {
  endpoint?: string;
  navigationTimeoutMs?: number;
  connectOverCDP?: (endpoint: string) => Promise<Browser>;
}

export class ChromeCdpManager implements BrowserConnectionManager {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private connectionPromise: Promise<BrowserContext> | undefined;
  private connectionState: 'connected' | 'disconnected' | 'not_connected' = 'not_connected';
  private readonly endpoint: string;
  private readonly navigationTimeoutMs: number;
  private readonly connectBrowser: (endpoint: string) => Promise<Browser>;

  constructor(options: ChromeCdpManagerOptions = {}) {
    this.endpoint = options.endpoint ?? process.env.CHROME_CDP_ENDPOINT ?? DEFAULT_CDP_ENDPOINT;
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? Number(process.env.WUZZUF_NAVIGATION_TIMEOUT_MS ?? DEFAULT_NAVIGATION_TIMEOUT_MS);
    this.connectBrowser = options.connectOverCDP ?? ((endpoint) => chromium.connectOverCDP(endpoint));
  }

  async connect(): Promise<BrowserContext> {
    if (this.browser?.isConnected() && this.context) return this.context;
    if (this.connectionPromise) return this.connectionPromise;
    this.connectionPromise = this.establishConnection();
    try { return await this.connectionPromise; } finally { this.connectionPromise = undefined; }
  }

  private async establishConnection(): Promise<BrowserContext> {
    this.browser = undefined;
    this.context = undefined;

    try {
      this.browser = await this.connectBrowser(this.endpoint);
    } catch (error) {
      this.connectionState = 'disconnected';
      throw new WuzzufToolError('CHROME_CDP_UNAVAILABLE', chromeConnectionMessage(), { status: 503, retryable: true, cause: error });
    }

    const connectedBrowser = this.browser;
    connectedBrowser.on('disconnected', () => {
      if (this.browser !== connectedBrowser) return;
      this.connectionState = 'disconnected';
      this.browser = undefined;
      this.context = undefined;
    });
    const contexts = this.browser.contexts();
    if (contexts.length === 0) {
      this.connectionState = 'disconnected';
      this.browser = undefined;
      throw new WuzzufToolError('CHROME_CDP_NO_CONTEXT', 'Connected to Chrome, but no browser context was available. Open a normal Chrome window and retry.', { status: 503, retryable: true });
    }

    this.context = contexts[0]!;
    this.connectionState = 'connected';
    return this.context;
  }

  async openTab(url: string): Promise<Page> {
    const context = await this.connect();
    const page = await context.newPage();
    page.setDefaultTimeout(this.navigationTimeoutMs);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.navigationTimeoutMs });
      return page;
    } catch (error) {
      if (page.isClosed()) throw new WuzzufToolError('WUZZUF_TAB_CLOSED', 'The Wuzzuf tab closed unexpectedly. Reopen it from the extension and retry.', { status: 409, retryable: true });
      if (!this.isConnected()) throw new WuzzufToolError('CHROME_CDP_DISCONNECTED', `${chromeConnectionMessage()}\nChrome disconnected while the Wuzzuf tab was loading.`, { status: 503, retryable: true, cause: error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // Playwright has no safe disconnect API for a Browser returned by connectOverCDP.
    // browser.close() may terminate the user's Chrome process, so shutdown only drops
    // application references and lets process exit tear down the transport.
    this.browser = undefined;
    this.context = undefined;
    this.connectionPromise = undefined;
    this.connectionState = 'not_connected';
  }

  isConnected(): boolean { return this.browser?.isConnected() === true && this.context !== undefined; }
  status(): 'connected' | 'disconnected' | 'not_connected' { return this.isConnected() ? 'connected' : this.connectionState; }
}

export function chromeConnectionMessage(): string {
  return [
    'Unable to connect to your existing Chrome browser.',
    '',
    'Start Chrome with remote debugging enabled:',
    '',
    'macOS:',
    'open -na "Google Chrome" --args --remote-debugging-port=9222',
    '',
    'Then restart the extension-jobs orchestrator.',
  ].join('\n');
}
