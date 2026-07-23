import { createContext, type FormEvent, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { KeyRound, LockKeyhole } from 'lucide-react';
import { ApiError, login, logout, restoreSession } from '../lib/api';

interface AuthContextValue {
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthBoundary({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'signed-out' | 'signed-in'>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    restoreSession().then(() => setState('signed-in')).catch((reason: unknown) => {
      if (reason instanceof ApiError && reason.status === 401) setState('signed-out');
      else { setError(reason instanceof Error ? reason.message : 'Could not reach the local daemon'); setState('signed-out'); }
    });
  }, []);

  const value = useMemo(() => ({
    signOut: async () => { await logout(); setState('signed-out'); }
  }), []);

  if (state === 'checking') return (
    <main className="auth-screen" aria-busy="true">
      <div className="loader" aria-label="Connecting to local daemon" />
    </main>
  );
  if (state === 'signed-out') return <Login error={error} onSuccess={() => { setError(''); setState('signed-in'); }} />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Login({ error, onSuccess }: { error: string; onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(error);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try { await login(code); onSuccess(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Sign in failed'); } finally { setPending(false); }
  }
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand-mark large" aria-hidden="true"><LockKeyhole /></div>
        <p className="eyebrow">LOCAL COMMAND CENTER</p>
        <h1 id="login-title">Your job search stays on your machine.</h1>
        <p className="lede">Enter the one-time code printed by the Extension Jobs daemon. The browser receives a short-lived HttpOnly session—not a reusable API token.</p>
        <form onSubmit={submit}>
          <label htmlFor="pairing-code">Pairing code</label>
          <div className="field-with-icon"><KeyRound aria-hidden="true" /><input id="pairing-code" autoComplete="one-time-code" required minLength={4} maxLength={256} value={code} onChange={(event) => setCode(event.target.value)} /></div>
          {message && <p className="form-error" role="alert">{message}</p>}
          <button className="button primary wide" disabled={pending}>{pending ? 'Connecting…' : 'Open dashboard'}</button>
        </form>
        <div className="privacy-note"><span className="status-dot" /> Bound to loopback · SameSite strict · CSRF protected</div>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="orbit one" /><div className="orbit two" />
        <div className="signal-card"><span>Reviewed by you</span><strong>Submission approval</strong><i /></div>
      </aside>
    </main>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Auth context unavailable');
  return value;
}

