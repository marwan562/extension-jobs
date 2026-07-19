import type { FieldAnswer, Job, RawJob } from '../../shared/src/domain.ts';

export interface AdapterContext { correlationId: string; dryRun: boolean; signal: AbortSignal }
export interface FormField { id: string; label: string; type: 'text' | 'email' | 'tel' | 'select' | 'radio' | 'checkbox' | 'file'; required: boolean; options?: string[] }
export interface ApprovedFile { id: string; path: string; approved: boolean }
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
