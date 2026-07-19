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
