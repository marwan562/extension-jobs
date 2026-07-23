import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RotateCcw } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Inbox /></div><h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return <div className="error-state" role="alert"><AlertTriangle /><div><h3>Something needs attention</h3><p>{error.message}</p></div>{retry && <button className="button ghost" onClick={retry}><RotateCcw /> Retry</button>}</div>;
}

export function ScoreRing({ score, size = 'normal' }: { score: number; size?: 'normal' | 'small' }) {
  const value = Math.max(0, Math.min(100, score));
  return <div className={`score-ring ${size}`} style={{ '--score': `${value * 3.6}deg` } as React.CSSProperties} aria-label={`${Math.round(value)} percent match`}><span>{Math.round(value)}</span></div>;
}

export function StatusBadge({ value }: { value: string }) {
  const tone = /submitted|approved|enabled|authenticated|online|ready/i.test(value) ? 'positive' : /failed|rejected|blocked|expired|stop/i.test(value) ? 'negative' : /await|review|required|paused|challenge/i.test(value) ? 'warning' : 'neutral';
  return <span className={`status-badge ${tone}`}>{value.replaceAll('_', ' ').toLocaleLowerCase()}</span>;
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return <div className="skeleton-stack" aria-label="Loading" aria-busy="true">{Array.from({ length: count }, (_, index) => <div key={index} className="skeleton-row"><i /><i /><i /></div>)}</div>;
}
