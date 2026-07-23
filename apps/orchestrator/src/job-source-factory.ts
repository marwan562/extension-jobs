import { ComposioLinkedInSource, FixtureJobSource, IndeedJobSource, MultiJobSource, WuzzufJobSource, type JobSource, type WuzzufAdapter } from '../../../packages/site-adapters/src/index.ts';
import type { OrchestratorConfig } from './config.ts';

export function createDirectJobSource(config: OrchestratorConfig, wuzzufAdapter: WuzzufAdapter): JobSource {
  if (config.JOB_SOURCE_MODE === 'development') return new FixtureJobSource();
  const modes = config.JOB_SOURCE_MODE.split(','); const sources: JobSource[] = [];
  if (modes.includes('fixture')) sources.push(new FixtureJobSource());
  if (modes.includes('wuzzuf') || modes.includes('multi')) sources.push(new WuzzufJobSource(wuzzufAdapter));
  if (modes.includes('indeed') || modes.includes('multi')) sources.push(new IndeedJobSource());
  if ((modes.includes('composio') || modes.includes('multi')) && config.COMPOSIO_LINKEDIN_SEARCH_TOOL) sources.push(new ComposioLinkedInSource(config.COMPOSIO_LINKEDIN_SEARCH_TOOL, JSON.parse(config.COMPOSIO_LINKEDIN_SEARCH_ARGS) as Record<string, unknown>));
  if (!sources.length) throw new Error(`JOB_SOURCE_MODE ${config.JOB_SOURCE_MODE} did not configure any job source`);
  return sources.length === 1 ? sources[0]! : new MultiJobSource(sources);
}

