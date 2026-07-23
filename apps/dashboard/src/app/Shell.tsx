import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Bell, BriefcaseBusiness, Cable, ChevronLeft, CircleStop, FileCheck2, FileStack,
  Gauge, Menu, MessageSquareText, MoonStar, PanelLeftClose, Search, Settings,
  ShieldCheck, Sun, Target, Workflow, X
} from 'lucide-react';
import { api, streamAssistant } from '../lib/api';
import type { Summary } from '../lib/types';
import { useAuth } from './Auth';

const nav = [
  { to: '/', label: 'Overview', icon: Gauge },
  { to: '/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { to: '/applications', label: 'Applications', icon: Workflow },
  { to: '/resume-studio', label: 'Resume Studio', icon: FileStack },
  { to: '/campaigns', label: 'Campaigns', icon: Target },
  { to: '/approvals', label: 'Approvals', icon: ShieldCheck },
  { to: '/connectors', label: 'Connectors', icon: Cable },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export function Shell({ children, theme, onThemeChange }: { children: ReactNode; theme: string; onThemeChange: (theme: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const location = useLocation();
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/summary'), refetchInterval: 30_000 });
  const emergency = useMutation({
    mutationFn: (active: boolean) => api(active ? '/emergency-stop/reset' : '/emergency-stop', { method: 'POST' }),
    onSuccess: () => { setStopOpen(false); void queryClient.invalidateQueries(); }
  });

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true); }
      if (event.key === 'Escape') { setPaletteOpen(false); setAssistantOpen(false); setNotificationsOpen(false); setMobileOpen(false); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    const events = new EventSource('/v1/dashboard/events');
    events.addEventListener('heartbeat', () => void queryClient.invalidateQueries({ queryKey: ['summary'] }));
    return () => events.close();
  }, [queryClient]);

  const activeSummary = summary.data;
  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><FileCheck2 /></div>
          <div className="brand-copy"><strong>Extension Jobs</strong><span>Private operations</span></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></button>
        </div>
        <nav>
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} title={collapsed ? label : undefined}>
              <Icon aria-hidden="true" /><span>{label}</span>
              {label === 'Approvals' && activeSummary?.counts.approvals ? <b className="nav-count">{activeSummary.counts.approvals}</b> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="privacy-chip"><span className="status-dot" /><div><strong>Local only</strong><small>127.0.0.1</small></div></div>
          <button className="collapse-button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><PanelLeftClose /><span>Collapse</span></button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <div className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu /></button>
          <button className="command-trigger" aria-label="Open command palette" onClick={() => setPaletteOpen(true)}><Search aria-hidden="true" /><span>Search or jump to…</span><kbd>⌘ K</kbd></button>
          <div className="top-actions">
            <div className={`health-pill ${activeSummary?.health.emergencyStop ? 'danger' : ''}`} title={`Browser: ${activeSummary?.health.browser ?? 'checking'}`}>
              <span className="status-dot" /> <span>{activeSummary?.health.emergencyStop ? 'Stopped' : 'Daemon online'}</span>
            </div>
            <div className="notification-wrap">
              <button className="icon-button" aria-label="Open notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((value) => !value)}><Bell />{activeSummary?.attention.length ? <i>{activeSummary.attention.length}</i> : null}</button>
              {notificationsOpen && <section className="notification-popover" aria-label="Notifications"><header><strong>Attention</strong><span>{activeSummary?.attention.length ?? 0} open</span></header>{activeSummary?.attention.length ? activeSummary.attention.slice(0, 6).map((item) => <NavLink key={item.id} to={item.kind === 'approval' ? '/approvals' : item.kind === 'manual_action' ? '/applications' : '/settings'} onClick={() => setNotificationsOpen(false)}><span className="status-dot" /><div><strong>{item.title}</strong><small>{item.detail}</small></div></NavLink>) : <p>Nothing needs your attention.</p>}</section>}
            </div>
            <button className="icon-button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? <Sun /> : <MoonStar />}</button>
            <button className="button danger-quiet emergency-button" onClick={() => setStopOpen(true)}><CircleStop /><span>Emergency stop</span></button>
            <button className="icon-button assistant-button" onClick={() => setAssistantOpen(true)} aria-label="Open assistant"><MessageSquareText /></button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <Assistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      {stopOpen && (
        <div className="dialog-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setStopOpen(false); }}>
          <section className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="stop-title" aria-describedby="stop-description">
            <div className="dialog-icon danger"><CircleStop /></div>
            <h2 id="stop-title">{activeSummary?.health.emergencyStop ? 'Resume local automation?' : 'Stop all automated work?'}</h2>
            <p id="stop-description">{activeSummary?.health.emergencyStop ? 'Queued work can continue after you clear the stop. Human approval is still required before submission.' : 'Running operations will receive cancellation requests. Your saved jobs and history remain intact.'}</p>
            {emergency.error && <p className="form-error" role="alert">{emergency.error.message}</p>}
            <div className="dialog-actions"><button className="button ghost" onClick={() => setStopOpen(false)}>Cancel</button><button className="button danger" disabled={emergency.isPending} onClick={() => emergency.mutate(Boolean(activeSummary?.health.emergencyStop))}>{activeSummary?.health.emergencyStop ? 'Clear emergency stop' : 'Stop automation'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const commands = useMemo(() => nav.filter((item) => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [query]);
  useEffect(() => input.current?.focus(), []);
  return (
    <div className="dialog-layer command-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <label className="command-search"><Search aria-hidden="true" /><span className="sr-only">Search commands</span><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Go to a workspace…" /><kbd>esc</kbd></label>
        <div className="command-results" role="listbox">
          <p className="eyebrow">WORKSPACES</p>
          {commands.map(({ to, label, icon: Icon }) => <button key={to} role="option" onClick={() => { navigate(to); onClose(); }}><Icon /><span>{label}</span><ChevronLeft className="command-arrow" /></button>)}
          {!commands.length && <p className="empty-inline">No matching workspace.</p>}
        </div>
      </section>
    </div>
  );
}

function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    { role: 'assistant', text: 'I can summarize jobs, explain workflow status, and help draft grounded answers. Submission approval stays with you.' }
  ]);
  const [pending, setPending] = useState(false);
  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    setMessages((value) => [...value, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setPending(true);
    try {
      await streamAssistant(text, (chunk) => setMessages((value) => value.map((message, index) => index === value.length - 1 ? { ...message, text: message.text + chunk } : message)));
    } catch (reason) {
      setMessages((value) => value.map((message, index) => index === value.length - 1 ? { ...message, text: reason instanceof Error ? reason.message : 'Assistant unavailable' } : message));
    } finally { setPending(false); }
  }
  if (!open) return null;
  return (
    <>
      <button className="drawer-scrim" aria-label="Close assistant" onClick={onClose} />
      <aside className="assistant-drawer open" aria-label="OpenClaw assistant">
        <header><div><p className="eyebrow">GROUNDED LOCALLY</p><h2>OpenClaw assistant</h2></div><button className="icon-button" onClick={onClose} aria-label="Close assistant"><X /></button></header>
        <div className="assistant-guard"><ShieldCheck /> No approval tokens or submission controls</div>
        <div className="assistant-messages" aria-live="polite">{messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}><span>{message.role === 'assistant' ? 'OpenClaw' : 'You'}</span><p>{message.text || 'Thinking…'}</p></div>)}</div>
        <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><label htmlFor="assistant-input" className="sr-only">Message assistant</label><textarea id="assistant-input" rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about your pipeline…" /><button className="button primary" disabled={pending}>Send</button></form>
      </aside>
    </>
  );
}
