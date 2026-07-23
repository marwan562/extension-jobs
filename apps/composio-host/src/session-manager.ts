import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Composio } from '@composio/core';
import { createWuzzufToolkit } from '@extension-jobs/composio-wuzzuf';
import { createJobsToolkit } from '@extension-jobs/composio-jobs';
import type { HostConfig } from './config.ts';

export class ComposioSessionManager {
  private readonly composio: Composio; private session: any; private initializedAt?: string;
  constructor(private readonly config: HostConfig) { this.composio = new Composio({ apiKey: config.apiKey }); }

  async initialize(): Promise<void> {
    const toolkits = this.localToolkits(); const sessionId = this.readSessionId();
    if (sessionId) { try { this.session = await this.composio.sessions.use(sessionId, { customToolkits: toolkits }); this.initializedAt = new Date().toISOString(); return; } catch { /* create a replacement only during lifecycle initialization */ } }
    this.session = await this.composio.sessions.create(this.config.userId, { toolkits: this.config.toolkits.includes('linkedin') ? ['linkedin'] : [], manageConnections: true, experimental: { customToolkits: toolkits } }); this.initializedAt = new Date().toISOString(); this.persistSessionId(this.session.sessionId);
  }

  status() { return { ready: !!this.session, sessionId: this.session?.sessionId, userId: this.config.userId, toolkits: this.config.toolkits, initializedAt: this.initializedAt }; }
  async tools() { this.assertReady(); const tools = await this.session.tools(); return tools.map((tool: any) => ({ name: tool.name, description: tool.description, inputParameters: tool.inputParameters })); }
  async execute(toolSlug: string, arguments_: Record<string, unknown>) { this.assertReady(); return this.session.execute(toolSlug, arguments_); }
  private assertReady() { if (!this.session) throw new Error('Composio session host is not initialized.'); }
  private localToolkits() { const result: any[] = []; if (this.config.toolkits.includes('jobs')) result.push(createJobsToolkit({ baseUrl: this.config.orchestratorUrl, toolToken: this.config.jobsToolToken })); if (this.config.toolkits.includes('wuzzuf')) result.push(createWuzzufToolkit({ baseUrl: this.config.orchestratorUrl, toolToken: this.config.jobsToolToken })); return result; }
  private readSessionId(): string | undefined { try { const parsed = JSON.parse(readFileSync(this.config.sessionFile, 'utf8')) as { sessionId?: unknown }; return typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined; } catch { return undefined; } }
  private persistSessionId(sessionId: string) { mkdirSync(dirname(this.config.sessionFile), { recursive: true, mode: 0o700 }); const temporary = `${this.config.sessionFile}.tmp`; writeFileSync(temporary, `${JSON.stringify({ sessionId, updatedAt: new Date().toISOString() })}\n`, { mode: 0o600 }); renameSync(temporary, this.config.sessionFile); }
}
