import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Eye, Laptop, LockKeyhole, LogOut, MoonStar, ShieldCheck, Sun } from 'lucide-react';
import { api } from '../lib/api';
import type { Summary } from '../lib/types';
import { ErrorState, PageHeader, StatusBadge } from '../components/UI';
import { useAuth } from '../app/Auth';

export default function Settings({ theme, onThemeChange }: { theme: string; onThemeChange: (theme: string) => void }) {
  const { signOut } = useAuth();
  const client = useQueryClient();
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/summary') });
  const emergency = useMutation({
    mutationFn: (active: boolean) => api(active ? '/emergency-stop/reset' : '/emergency-stop', { method: 'POST' }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['summary'] }); }
  });
  return <div className="page settings-page">
    <PageHeader eyebrow="LOCAL CONTROL" title="Settings & privacy" description="Tune the interface, inspect daemon health, and control automation without exposing secrets." />
    {summary.error && <ErrorState error={summary.error} />}
    <div className="settings-grid">
      <section className="panel settings-section"><header><div className="settings-icon"><Sun /></div><div><h2>Appearance</h2><p>Choose a calm theme that follows your environment.</p></div></header><div className="theme-picker" role="radiogroup" aria-label="Color theme">{[{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: MoonStar }, { value: 'system', label: 'System', icon: Laptop }].map(({ value, label, icon: Icon }) => <button key={value} role="radio" aria-checked={theme === value} className={theme === value ? 'active' : ''} onClick={() => onThemeChange(value)}><Icon /><span>{label}</span></button>)}</div></section>
      <section className="panel settings-section"><header><div className="settings-icon"><Database /></div><div><h2>Local data boundary</h2><p>SQLite and artifacts stay inside the daemon-owned data directory.</p></div></header><dl className="settings-list"><div><dt>Storage</dt><dd><StatusBadge value={summary.data?.health.storage ?? 'checking'} /></dd></div><div><dt>Browser worker</dt><dd><StatusBadge value={summary.data?.health.browser ?? 'checking'} /></dd></div><div><dt>Queue</dt><dd>{Object.values(summary.data?.queue ?? {}).reduce((sum, value) => sum + value, 0)} records</dd></div></dl></section>
      <section className="panel settings-section"><header><div className="settings-icon"><LockKeyhole /></div><div><h2>Session security</h2><p>The pairing code becomes a short-lived HttpOnly cookie and session-bound CSRF value.</p></div></header><ul className="security-list"><li><ShieldCheck /> Exact loopback origin enforced</li><li><Eye /> No daemon token in local storage</li><li><LockKeyhole /> SameSite strict browser session</li></ul><button className="button ghost" onClick={() => void signOut()}><LogOut /> Sign out this browser</button></section>
      <section className={`panel settings-section danger-zone ${summary.data?.health.emergencyStop ? 'active' : ''}`}><header><div className="settings-icon"><ShieldCheck /></div><div><h2>Emergency stop</h2><p>Request cancellation for active queue work and block new automated operations.</p></div><StatusBadge value={summary.data?.health.emergencyStop ? 'active' : 'ready'} /></header><button className={`button ${summary.data?.health.emergencyStop ? 'primary' : 'danger'}`} disabled={emergency.isPending} onClick={() => emergency.mutate(Boolean(summary.data?.health.emergencyStop))}>{summary.data?.health.emergencyStop ? 'Clear emergency stop' : 'Stop all automation'}</button>{emergency.error && <p className="form-error" role="alert">{emergency.error.message}</p>}</section>
    </div>
  </div>;
}

