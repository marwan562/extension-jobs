let csrfToken = '';

interface Envelope<T> {
  ok: boolean;
  data: T;
  error?: string;
  correlationId: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly correlationId?: string;
  constructor(status: number, message: string, correlationId?: string) {
    super(message);
    this.status = status;
    this.correlationId = correlationId;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (!['GET', 'HEAD'].includes(method.toUpperCase()) && csrfToken) headers.set('x-csrf-token', csrfToken);
  const response = await fetch(`/v1/dashboard${path}`, { ...init, headers, credentials: 'same-origin' });
  const type = response.headers.get('content-type') ?? '';
  const payload = type.includes('application/json') ? await response.json() as Envelope<T> : undefined;
  if (!response.ok) throw new ApiError(response.status, payload?.error ?? `Request failed (${response.status})`, payload?.correlationId);
  return payload?.data as T;
}

export async function restoreSession(): Promise<{ authenticated: true; expiresAt: string }> {
  const session = await api<{ authenticated: true; csrfToken: string; expiresAt: string }>('/session');
  csrfToken = session.csrfToken;
  return session;
}

export async function login(code: string): Promise<void> {
  const session = await api<{ csrfToken: string }>('/session', { method: 'POST', body: JSON.stringify({ code }) });
  csrfToken = session.csrfToken;
}

export async function logout(): Promise<void> {
  await api('/session', { method: 'DELETE' });
  csrfToken = '';
}

export async function streamAssistant(text: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<void> {
  const response = await fetch('/v1/dashboard/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ text }),
    signal
  });
  if (!response.ok || !response.body) throw new ApiError(response.status, 'Assistant request failed');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as { type: string; text?: string };
      if (event.type === 'chunk' && event.text) onChunk(event.text);
    }
  }
}

