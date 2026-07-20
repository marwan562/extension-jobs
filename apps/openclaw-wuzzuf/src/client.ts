export interface PluginConfig { bridgeUrl?: string; toolToken: string; timeoutMs?: number }

export async function request(config: PluginConfig, path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const baseUrl = config.bridgeUrl ?? 'http://127.0.0.1:18790';
  try {
    const url = new URL(baseUrl); if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return failure('INVALID_BRIDGE_URL', 'bridgeUrl must be an HTTP loopback URL.');
    const response = await fetch(`${url.origin}${path}`, { method, headers: { 'x-openclaw-tool-token': config.toolToken, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(config.timeoutMs ?? 60_000), redirect: 'error' });
    const data = await response.json() as Record<string, unknown>; if (!response.ok) return data.error ? { ok: false, error: data.error } : failure('ORCHESTRATOR_REQUEST_FAILED', `Job bridge returned ${response.status}.`, response.status >= 500); return data;
  } catch (error) { return failure('ORCHESTRATOR_UNAVAILABLE', 'The local job orchestrator is unavailable. Start it and verify the plugin bridge configuration.', true, error); }
}

function failure(code: string, message: string, retryable = false, _cause?: unknown) { return { ok: false, error: { code, message, retryable, correlationId: crypto.randomUUID(), actionRequired: retryable ? 'Start or restart the local extension-jobs orchestrator.' : undefined } }; }
