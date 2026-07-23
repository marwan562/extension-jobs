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
  if (message.type === 'analyzeCurrentJob') { const tab = await activeConnectorTab(); const page = await chrome.tabs.sendMessage(tab.id, { type: 'analyze-job' }); return api('/v1/jobs/import-current-page', 'POST', page); }
  if (message.type === 'inspect-form') { const tab = await activeConnectorTab(); return chrome.tabs.sendMessage(tab.id, { type: 'inspect-form' }); }
  if (message.type === 'fill-approved') {
    const tab = await activeConnectorTab();
    return chrome.tabs.sendMessage(tab.id, { type: 'fill-approved', answers: message.answers, dryRun: message.dryRun !== false });
  }
  if (message.type === 'wuzzuf') return api(`/v1/wuzzuf/tools/${encodeURIComponent(String(message.action))}`, 'POST', message.body ?? {});
  if (message.type === 'wuzzufPendingApprovals') return api('/v1/wuzzuf/approval-requests', 'GET');
  if (message.type === 'wuzzufApprovalDecision') return api(`/v1/wuzzuf/approval-requests/${encodeURIComponent(String(message.approvalRequestId))}/decision`, 'POST', { approved: message.approved === true });
  const routes: Record<string, { path: string; method?: string; body?: unknown }> = {
    dashboard: { path: '/v1/dashboard' }, connectors: { path: '/v1/connectors' }, configureConnector: { path: `/v1/connectors/${encodeURIComponent(String(message.connectorId))}`, method: 'POST', body: { enabled: message.enabled === true } }, scoreJob: { path: '/v1/jobs/score', method: 'POST', body: { jobId: message.jobId, profileId: message.profileId } }, importProfile: { path: '/v1/resumes/import', method: 'POST', body: message.body }, registeredResumes: { path: '/v1/resumes' }, approveRegisteredResume: { path: `/v1/resumes/${encodeURIComponent(String(message.resumeId))}/approve`, method: 'POST', body: {} }, removeRegisteredResume: { path: `/v1/resumes/${encodeURIComponent(String(message.resumeId))}/remove`, method: 'POST', body: {} }, tailorResume: { path: `/v1/jobs/${encodeURIComponent(String(message.jobId))}/tailor-resume`, method: 'POST', body: { resumeId: message.resumeId } }, approveTailoredResume: { path: `/v1/tailored-resumes/${encodeURIComponent(String(message.tailoredResumeId))}/approve`, method: 'POST', body: {} }, artifactContent: { path: `/v1/artifacts/${encodeURIComponent(String(message.artifactId))}/content` }, deleteData: { path: '/v1/data/delete', method: 'POST', body: { confirmation: message.confirmation } }, queueStatus: { path: '/health/queue' },
    createCampaign: { path: '/v1/campaigns', method: 'POST', body: message.body }, runCampaign: { path: `/v1/campaigns/${encodeURIComponent(String(message.id))}/run`, method: 'POST' }, pauseCampaign: { path: `/v1/campaigns/${encodeURIComponent(String(message.id))}/pause`, method: 'POST' }, resumeCampaign: { path: `/v1/campaigns/${encodeURIComponent(String(message.id))}/resume`, method: 'POST' },
    updateFact: { path: `/v1/profiles/${encodeURIComponent(String(message.profileId))}/facts/${encodeURIComponent(String(message.factId))}`, method: 'POST', body: { value: message.value } }, approveResume: { path: `/v1/profiles/${encodeURIComponent(String(message.profileId))}/resumes/${encodeURIComponent(String(message.resumeId))}/approve`, method: 'POST', body: { approved: message.approved === true } }, models: { path: '/v1/models' }, saveAgentSettings: { path: '/v1/agent-settings', method: 'POST', body: message.body }, prepareAnswers: { path: '/v1/answers/prepare', method: 'POST', body: message.body },
    recordFill: { path: `/v1/applications/${encodeURIComponent(String(message.applicationId))}/fill-result`, method: 'POST', body: message.body },
    emergencyStop: { path: '/v1/emergency-stop', method: 'POST' }, resetStop: { path: '/v1/emergency-stop/reset', method: 'POST' }
  };
  const selected = routes[message.type]; if (!selected) throw new Error('Unsupported extension action');
  return api(selected.path, selected.method ?? 'GET', selected.body);
}

async function activeConnectorTab(): Promise<{ id: number; url: string }> { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id || !tab.url) throw new Error('Open a supported job page first'); const url = new URL(tab.url); if (url.protocol !== 'https:' || !supportedHost(url.hostname)) throw new Error('This site is not enabled by the connector registry'); const origin = `${url.protocol}//${url.hostname}/*`; const granted = await chrome.permissions.contains({ origins: [origin] }) || await chrome.permissions.request({ origins: [origin] }); if (!granted) throw new Error('Site permission is required only for this connector'); await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/content-script.js'] }); return { id: tab.id, url: tab.url }; }
function supportedHost(hostname: string): boolean { const host = hostname.toLowerCase().replace(/^www\./, ''); return ['wuzzuf.net', 'indeed.com', 'linkedin.com', 'bayt.com', 'glassdoor.com', 'ziprecruiter.com', 'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'smartrecruiters.com', 'myworkdayjobs.com'].some((allowed) => host === allowed || host.endsWith(`.${allowed}`)); }

async function token(): Promise<string> { const { bridgeSession } = await chrome.storage.session.get('bridgeSession'); if (!bridgeSession?.token) throw new Error('Pair with the orchestrator first'); return bridgeSession.token; }
async function api(path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${BRIDGE}${path}`, { method, headers: { authorization: `Bearer ${await token()}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); if (!response.ok) throw new Error(typeof value.error === 'object' ? `${value.error.code}: ${value.error.message}` : value.error ?? `Bridge returned ${response.status}`); return value;
}
async function streamChat(text: string, profileId?: string): Promise<void> {
  try {
    const response = await fetch(`${BRIDGE}/v1/chat`, { method: 'POST', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ text, ...(profileId ? { profileId } : {}) }) });
    if (!response.ok || !response.body) throw new Error(`Chat failed (${response.status})`);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader(); let buffer = '';
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += value; const lines = buffer.split('\n'); buffer = lines.pop() ?? ''; for (const line of lines) if (line) chrome.runtime.sendMessage({ type: 'chat-event', event: JSON.parse(line) }); }
  } catch (error) { chrome.runtime.sendMessage({ type: 'chat-event', event: { type: 'error', text: error instanceof Error ? error.message : 'Chat failed' } }); }
}
