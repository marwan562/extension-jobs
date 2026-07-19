export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatRequest { messages: ChatMessage[]; model?: string; signal?: AbortSignal }
export interface ModelInfo { id: string; name: string }
export interface LlmProvider {
  id: string;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  discoverModels(): Promise<ModelInfo[]>;
  streamChat(request: ChatRequest): AsyncIterable<string>;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: string;
  private readonly config: { id: string; baseUrl: string; apiKey?: string; defaultModel: string; timeoutMs?: number };
  constructor(config: { id: string; baseUrl: string; apiKey?: string; defaultModel: string; timeoutMs?: number }) { this.config = config; this.id = config.id; }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try { const models = await this.discoverModels(); return { ok: true, detail: `${models.length} models available` }; }
    catch (error) { return { ok: false, detail: error instanceof Error ? error.message : 'Connection failed' }; }
  }

  async discoverModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.config.baseUrl}/models`, { headers: this.headers(), signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000) });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const body = await response.json() as { data?: Array<{ id: string }> };
    return (body.data ?? []).map(({ id }) => ({ id, name: id }));
  }

  async *streamChat(request: ChatRequest): AsyncIterable<string> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST', headers: this.headers(), signal: request.signal ?? AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
      body: JSON.stringify({ model: request.model ?? this.config.defaultModel, messages: request.messages, stream: true })
    });
    if (!response.ok || !response.body) throw new Error(`Provider returned ${response.status}`);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break; buffer += value;
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
        try { const event = JSON.parse(line.slice(5)) as { choices?: Array<{ delta?: { content?: string } }> }; const chunk = event.choices?.[0]?.delta?.content; if (chunk) yield chunk; } catch { /* malformed provider chunk is ignored */ }
      }
    }
  }

  private headers(): Record<string, string> {
    return { 'content-type': 'application/json', ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}) };
  }
}

export class DevelopmentProvider implements LlmProvider {
  id = 'development';
  async testConnection() { return { ok: true, detail: 'Deterministic development provider' }; }
  async discoverModels() { return [{ id: 'development', name: 'Development' }]; }
  async *streamChat(request: ChatRequest): AsyncIterable<string> {
    const message = request.messages.at(-1)?.content ?? '';
    for (const token of `OpenClaw development response: ${message}`.split(/(?<=\s)/)) yield token;
  }
}

export class OpenClawGatewayProvider implements LlmProvider {
  id = 'openclaw-gateway'; private readonly agentId: string; private readonly sessionKey: string; private readonly timeoutSeconds: number;
  constructor(options: { agentId?: string; sessionKey?: string; timeoutSeconds?: number } = {}) { this.agentId = options.agentId ?? 'main'; this.sessionKey = options.sessionKey ?? `agent:${this.agentId}:extension-job-copilot`; this.timeoutSeconds = options.timeoutSeconds ?? 120; }
  async testConnection(): Promise<{ ok: boolean; detail: string }> { try { await this.run(['gateway', 'health', '--json'], 15_000); return { ok: true, detail: 'OpenClaw Gateway connected' }; } catch (error) { return { ok: false, detail: error instanceof Error ? error.message : 'Gateway unavailable' }; } }
  async discoverModels(): Promise<ModelInfo[]> { const output = await this.run(['models', 'list', '--json'], 30_000); const data = JSON.parse(output) as { models?: Array<{ key?: string; id?: string; name?: string; available?: boolean; missing?: boolean }> }; return (data.models ?? []).filter((model) => model.available !== false && model.missing !== true).map((model) => ({ id: model.key ?? model.id ?? model.name ?? '', name: model.name ?? model.key ?? model.id ?? '' })).filter((model) => model.id); }
  async *streamChat(request: ChatRequest): AsyncIterable<string> { const prompt = request.messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n'); const args = ['agent', '--agent', this.agentId, '--session-key', this.sessionKey, '--message', prompt, '--timeout', String(this.timeoutSeconds), '--json']; if (request.model && request.model !== 'default') args.push('--model', request.model); const output = await this.run(args, this.timeoutSeconds * 1000 + 10_000, request.signal); const data = JSON.parse(output) as { result?: { payloads?: Array<{ text?: string }> }; reply?: string; message?: string }; const reply = data.result?.payloads?.map((payload) => payload.text ?? '').join('\n').trim() || data.reply || data.message; if (!reply) throw new Error('OpenClaw returned no text response'); for (const chunk of reply.split(/(?<=\s)/)) yield chunk; }
  private async run(args: string[], timeout: number, signal?: AbortSignal): Promise<string> { const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); const execute = promisify(execFile); const result = await execute('openclaw', args, { timeout, maxBuffer: 4_000_000, ...(signal ? { signal } : {}) }); return result.stdout; }
}
