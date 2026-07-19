const BRIDGE = 'http://127.0.0.1:18790';
type Message = { type: string; [key: string]: unknown };

chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }));

chrome.runtime.onMessage.addListener((message: Message, sender: unknown, sendResponse: (value: unknown) => void) => {
  void route(message, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Request failed' }));
  return true;
});

async function route(message: Message, _sender: unknown): Promise<unknown> {
  if (message.type === 'pair') {
    const response = await fetch(`${BRIDGE}/v1/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: message.code }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Pairing failed');
    await chrome.storage.session.set({ bridgeSession: body }); return { ok: true, expiresAt: body.expiresAt };
  }
  if (message.type === 'chat') { void streamChat(String(message.text ?? ''), typeof message.profileId === 'string' ? message.profileId : undefined); return { ok: true }; }
  if (message.type === 'inspect-form') { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id) throw new Error('Open a job application page first'); return chrome.tabs.sendMessage(tab.id, { type: 'inspect-form' }); }
  if (message.type === 'fill-approved') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id) throw new Error('No active tab');
    return chrome.tabs.sendMessage(tab.id, { type: 'fill-approved', answers: message.answers, dryRun: message.dryRun !== false });
  }
  const routes: Record<string, { path: string; method?: string; body?: unknown }> = {
    dashboard: { path: '/v1/dashboard' }, importProfile: { path: '/v1/profiles/import', method: 'POST', body: message.body },
    createCampaign: { path: '/v1/campaigns', method: 'POST', body: message.body }, runCampaign: { path: `/v1/campaigns/${encodeURIComponent(String(message.id))}/run`, method: 'POST' }, pauseCampaign: { path: `/v1/campaigns/${encodeURIComponent(String(message.id))}/pause`, method: 'POST' }, resumeCampaign: { path: `/v1/campaigns/${encodeURIComponent(String(message.id))}/resume`, method: 'POST' },
    updateFact: { path: `/v1/profiles/${encodeURIComponent(String(message.profileId))}/facts/${encodeURIComponent(String(message.factId))}`, method: 'POST', body: { value: message.value } }, models: { path: '/v1/models' }, saveAgentSettings: { path: '/v1/agent-settings', method: 'POST', body: message.body }, prepareAnswers: { path: '/v1/answers/prepare', method: 'POST', body: message.body },
    recordFill: { path: `/v1/applications/${encodeURIComponent(String(message.applicationId))}/fill-result`, method: 'POST', body: message.body },
    emergencyStop: { path: '/v1/emergency-stop', method: 'POST' }, resetStop: { path: '/v1/emergency-stop/reset', method: 'POST' }
  };
  const selected = routes[message.type]; if (!selected) throw new Error('Unsupported extension action');
  return api(selected.path, selected.method ?? 'GET', selected.body);
}

async function token(): Promise<string> { const { bridgeSession } = await chrome.storage.session.get('bridgeSession'); if (!bridgeSession?.token) throw new Error('Pair with the orchestrator first'); return bridgeSession.token; }
async function api(path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${BRIDGE}${path}`, { method, headers: { authorization: `Bearer ${await token()}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error ?? `Bridge returned ${response.status}`); return value;
}
async function streamChat(text: string, profileId?: string): Promise<void> {
  try {
    const response = await fetch(`${BRIDGE}/v1/chat`, { method: 'POST', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ text, ...(profileId ? { profileId } : {}) }) });
    if (!response.ok || !response.body) throw new Error(`Chat failed (${response.status})`);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader(); let buffer = '';
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += value; const lines = buffer.split('\n'); buffer = lines.pop() ?? ''; for (const line of lines) if (line) chrome.runtime.sendMessage({ type: 'chat-event', event: JSON.parse(line) }); }
  } catch (error) { chrome.runtime.sendMessage({ type: 'chat-event', event: { type: 'error', text: error instanceof Error ? error.message : 'Chat failed' } }); }
}
