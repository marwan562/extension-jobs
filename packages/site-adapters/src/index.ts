import type { FieldAnswer, Job, RawJob } from '../../shared/src/domain.ts';
export { WuzzufAdapter, WuzzufJobSource, type WuzzufAdapterOptions } from './wuzzuf-adapter.ts';
export { normalizeWuzzufUrl, sourceIdFromWuzzufUrl, parseWuzzufSearchHtml, parseWuzzufJobHtml, detectWuzzufPageState } from './wuzzuf-parser.ts';

export interface AdapterContext { correlationId: string; dryRun: boolean; signal: AbortSignal }
export interface FormField { id: string; label: string; type: 'text' | 'email' | 'tel' | 'select' | 'radio' | 'checkbox' | 'file'; required: boolean; options?: string[] }
export interface ApprovedFile { id: string; path?: string; content?: Uint8Array; sourceName?: string; approved: boolean }
export interface JobSiteAdapter {
  id: string;
  matches(url: URL): boolean;
  authenticate(context: AdapterContext): Promise<{ status: 'authenticated' | 'handoff_required'; reason?: string }>;
  discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]>;
  readJob(url: URL): Promise<Job>;
  startApplication(job: Job, context: AdapterContext): Promise<{ id: string; url: string }>;
  collectFields(session: { id: string; url: string }): Promise<FormField[]>;
  fillFields(session: { id: string; url: string }, answers: FieldAnswer[], context: AdapterContext): Promise<{ filled: string[]; skipped: string[] }>;
  uploadApprovedFile(session: { id: string; url: string }, file: ApprovedFile): Promise<{ uploaded: boolean }>;
  validate(session: { id: string; url: string }): Promise<{ valid: boolean; errors: string[] }>;
}

export interface JobSource { id: string; discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> }

export class FixtureJobSource implements JobSource {
  id = 'fixture';
  async discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> {
    const query = criteria.queries[0] ?? 'Node.js backend'; const location = criteria.locations[0] ?? 'Cairo, Egypt';
    return [{ source: 'development', sourceId: 'dev-greenhouse-1', url: 'http://127.0.0.1:18791/mock-application', title: `Senior ${query} Engineer`, employer: 'Example Labs', location, description: `Build production TypeScript Node.js services. Remote role in ${location}.`, requiredSkills: ['TypeScript', 'Node.js'], preferredSkills: ['React'], remote: true, seniority: 'senior' }];
  }
}

export class ComposioLinkedInSource implements JobSource {
  id = 'composio-linkedin';
  private readonly toolSlug: string; private readonly baseArgs: Record<string, unknown>;
  constructor(toolSlug: string, baseArgs: Record<string, unknown> = {}) { this.toolSlug = toolSlug; this.baseArgs = baseArgs; }
  async discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> {
    if (!this.toolSlug) throw new Error('COMPOSIO_LINKEDIN_SEARCH_TOOL is not configured');
    const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util');
    const run = promisify(execFile);
    const args = { ...this.baseArgs, query: criteria.queries.join(' OR '), location: criteria.locations.join(' OR ') };
    const { stdout } = await run('composio', ['execute', this.toolSlug, '-d', JSON.stringify(args)], { timeout: 30_000, maxBuffer: 1_000_000 });
    const result = JSON.parse(stdout) as { data?: { jobs?: unknown[] } | unknown[] }; const rows = Array.isArray(result.data) ? result.data : (result.data as { jobs?: unknown[] } | undefined)?.jobs ?? [];
    return rows.map((row, index) => {
      const item = row as Record<string, unknown>;
      return { source: 'linkedin', sourceId: String(item.id ?? index), url: String(item.url ?? ''), title: String(item.title ?? ''), employer: String(item.company ?? item.employer ?? ''), location: String(item.location ?? ''), description: String(item.description ?? '') };
    }).filter((job) => job.url && job.title);
  }
}

export class IndeedJobSource implements JobSource {
  id = 'indeed';
  async discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> {
    const { chromium } = await import('playwright');
    const query = criteria.queries[0] ?? 'Frontend';
    const location = criteria.locations[0] ?? 'Egypt';
    console.log(`[IndeedJobSource] Discovering: query="${query}", location="${location}"`);
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('.job_seen_beacon', { timeout: 15000 }).catch(() => {});
      const jobs = await page.evaluate((loc) => {
        const cards = document.querySelectorAll('.job_seen_beacon');
        const results: any[] = [];
        cards.forEach((card, idx) => {
          const titleEl = card.querySelector('h2.jobTitle a, a.jcs-JobTitle');
          const companyEl = card.querySelector('[data-testid="company-name"]');
          const locEl = card.querySelector('[data-testid="text-location"]');
          const snippetEl = card.querySelector('.job-snippet, .underLine');
          if (titleEl && titleEl.getAttribute('href')) {
            const href = titleEl.getAttribute('href') || '';
            const jobUrl = href.startsWith('http') ? href : 'https://www.indeed.com' + href;
            const title = titleEl.textContent?.trim() || '';
            const employer = companyEl?.textContent?.trim() || 'Unknown Company';
            const locationText = locEl?.textContent?.trim() || loc;
            const description = snippetEl?.textContent?.trim() || `Indeed job at ${employer} in ${locationText}`;
            results.push({
              source: 'indeed',
              sourceId: jobUrl.split('jk=')[1]?.split('&')[0] || String(idx),
              url: jobUrl,
              title,
              employer,
              location: locationText,
              description,
              requiredSkills: [],
              remote: description.toLowerCase().includes('remote') || locationText.toLowerCase().includes('remote'),
              seniority: title.toLowerCase().includes('senior') ? 'senior' : 'mid'
            });
          }
        });
        return results;
      }, location);
      console.log(`[IndeedJobSource] Found ${jobs.length} jobs`);
      return jobs;
    } finally {
      await browser.close();
    }
  }
}

export class MultiJobSource implements JobSource {
  id = 'multi';
  private readonly sources: JobSource[];
  constructor(sources: JobSource[]) { this.sources = sources; }
  async discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> {
    const results = await Promise.all(this.sources.map(async (source) => {
      try {
        return await source.discover(criteria);
      } catch (error) {
        process.stderr.write(`Source ${source.id} discover failed: ${error instanceof Error ? error.message : String(error)}\n`);
        return [];
      }
    }));
    return results.flat();
  }
}

export class IndeedAdapter implements JobSiteAdapter {
  id = 'indeed';
  private browser: any | undefined;
  private readonly pages = new Map<string, any>();

  matches(url: URL): boolean { return url.hostname.includes('indeed.com'); }
  async authenticate(): Promise<{ status: 'authenticated' }> { return { status: 'authenticated' }; }
  async discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> {
    return new IndeedJobSource().discover(criteria);
  }
  async readJob(url: URL): Promise<Job> {
    const { normalizeJob } = await import('../../shared/src/jobs.ts');
    return normalizeJob({
      source: this.id,
      sourceId: url.searchParams.get('jk') || 'indeed-job',
      url: url.href,
      title: 'Job on Indeed',
      employer: 'Indeed Employer',
      location: 'Egypt',
      description: 'Job description loaded from Indeed',
      requiredSkills: [],
      remote: false
    });
  }
  async startApplication(job: Job, context: AdapterContext): Promise<{ id: string; url: string }> {
    context.signal.throwIfAborted();
    const { chromium } = await import('playwright');
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
      });
    }
    const browserContext = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    const page = await browserContext.newPage();
    await page.goto(job.url);
    const id = crypto.randomUUID();
    this.pages.set(id, page);
    return { id, url: job.url };
  }
  async collectFields(session: { id: string }): Promise<FormField[]> {
    const page = this.page(session.id);
    return page.locator('form [required], form input, form select, form textarea').evaluateAll((nodes: any) =>
      nodes.filter((node: any) => node.tagName !== 'BUTTON').map((node: any) => {
        const el = node as HTMLInputElement | HTMLSelectElement;
        const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() : el.getAttribute('aria-label');
        return {
          id: el.id,
          label: label ?? el.name,
          type: el.type === 'email' ? 'email' : el.type === 'tel' ? 'tel' : el.tagName === 'SELECT' ? 'select' : 'text',
          required: el.required,
          ...(el instanceof HTMLSelectElement ? { options: Array.from(el.options).map((o) => o.text).filter(Boolean) } : {})
        };
      })
    ) as Promise<FormField[]>;
  }
  async fillFields(session: { id: string }, answers: FieldAnswer[], context: AdapterContext): Promise<{ filled: string[]; skipped: string[] }> {
    context.signal.throwIfAborted();
    const page = this.page(session.id);
    const filled: string[] = [], skipped: string[] = [];
    for (const answer of answers) {
      if (answer.confirmationRequired || !answer.value) { skipped.push(answer.label); continue; }
      const locator = page.getByLabel(answer.label, { exact: true });
      if (await locator.count() !== 1) { skipped.push(answer.label); continue; }
      if (!context.dryRun) {
        const tag = await locator.evaluate((el: any) => el.tagName);
        if (tag === 'SELECT') await locator.selectOption({ label: answer.value });
        else await locator.fill(answer.value);
      }
      filled.push(answer.label);
    }
    return { filled, skipped };
  }
  async uploadApprovedFile(): Promise<{ uploaded: boolean }> { return { uploaded: false }; }
  async validate(session: { id: string }): Promise<{ valid: boolean; errors: string[] }> {
    const page = this.page(session.id);
    const invalid = await page.locator('form :invalid').count();
    return { valid: invalid === 0, errors: invalid ? [`${invalid} invalid fields`] : [] };
  }
  async close(): Promise<void> { await this.browser?.close(); this.pages.clear(); this.browser = undefined; }
  private page(id: string): any { const page = this.pages.get(id); if (!page) throw new Error('Application session not found'); return page; }
}

export class LinkedInAdapter implements JobSiteAdapter {
  id = 'linkedin';
  private browser: any | undefined;
  private readonly pages = new Map<string, any>();

  matches(url: URL): boolean { return url.hostname.includes('linkedin.com'); }
  async authenticate(): Promise<{ status: 'authenticated' }> { return { status: 'authenticated' }; }
  async discover(criteria: { queries: string[]; locations: string[] }): Promise<RawJob[]> {
    const searchMode = process.env.JOB_SOURCE_MODE || 'fixture';
    if (searchMode === 'composio' || searchMode === 'multi') {
      const slug = process.env.COMPOSIO_LINKEDIN_SEARCH_TOOL || '';
      const args = JSON.parse(process.env.COMPOSIO_LINKEDIN_SEARCH_ARGS ?? '{}') as Record<string, unknown>;
      return new ComposioLinkedInSource(slug, args).discover(criteria);
    }
    return [];
  }
  async readJob(url: URL): Promise<Job> {
    const { normalizeJob } = await import('../../shared/src/jobs.ts');
    return normalizeJob({
      source: this.id,
      sourceId: url.pathname.split('/').pop() || 'linkedin-job',
      url: url.href,
      title: 'Job on LinkedIn',
      employer: 'LinkedIn Employer',
      location: 'Egypt',
      description: 'Job description loaded from LinkedIn',
      requiredSkills: [],
      remote: false
    });
  }
  async startApplication(job: Job, context: AdapterContext): Promise<{ id: string; url: string }> {
    context.signal.throwIfAborted();
    const { chromium } = await import('playwright');
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
      });
    }
    const browserContext = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    const page = await browserContext.newPage();
    await page.goto(job.url);
    const id = crypto.randomUUID();
    this.pages.set(id, page);
    return { id, url: job.url };
  }
  async collectFields(session: { id: string }): Promise<FormField[]> {
    const page = this.page(session.id);
    return page.locator('form [required], form input, form select, form textarea').evaluateAll((nodes: any) =>
      nodes.filter((node: any) => node.tagName !== 'BUTTON').map((node: any) => {
        const el = node as HTMLInputElement | HTMLSelectElement;
        const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() : el.getAttribute('aria-label');
        return {
          id: el.id,
          label: label ?? el.name,
          type: el.type === 'email' ? 'email' : el.type === 'tel' ? 'tel' : el.tagName === 'SELECT' ? 'select' : 'text',
          required: el.required,
          ...(el instanceof HTMLSelectElement ? { options: Array.from(el.options).map((o) => o.text).filter(Boolean) } : {})
        };
      })
    ) as Promise<FormField[]>;
  }
  async fillFields(session: { id: string }, answers: FieldAnswer[], context: AdapterContext): Promise<{ filled: string[]; skipped: string[] }> {
    context.signal.throwIfAborted();
    const page = this.page(session.id);
    const filled: string[] = [], skipped: string[] = [];
    for (const answer of answers) {
      if (answer.confirmationRequired || !answer.value) { skipped.push(answer.label); continue; }
      const locator = page.getByLabel(answer.label, { exact: true });
      if (await locator.count() !== 1) { skipped.push(answer.label); continue; }
      if (!context.dryRun) {
        const tag = await locator.evaluate((el: any) => el.tagName);
        if (tag === 'SELECT') await locator.selectOption({ label: answer.value });
        else await locator.fill(answer.value);
      }
      filled.push(answer.label);
    }
    return { filled, skipped };
  }
  async uploadApprovedFile(): Promise<{ uploaded: boolean }> { return { uploaded: false }; }
  async validate(session: { id: string }): Promise<{ valid: boolean; errors: string[] }> {
    const page = this.page(session.id);
    const invalid = await page.locator('form :invalid').count();
    return { valid: invalid === 0, errors: invalid ? [`${invalid} invalid fields`] : [] };
  }
  async close(): Promise<void> { await this.browser?.close(); this.pages.clear(); this.browser = undefined; }
  private page(id: string): any { const page = this.pages.get(id); if (!page) throw new Error('Application session not found'); return page; }
}
