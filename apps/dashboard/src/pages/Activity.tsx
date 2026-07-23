import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity as ActivityIcon, Search, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { Page } from '../lib/types';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '../components/UI';

interface AuditEvent { id: string; correlationId: string; applicationId?: string; type: string; at: string; detail: Record<string, unknown> }

export default function Activity() {
  const [query, setQuery] = useState('');
  const activity = useQuery({ queryKey: ['activity'], queryFn: () => api<Page<AuditEvent>>('/activity?limit=100') });
  const values = activity.data?.items.filter((item) => `${item.type} ${item.correlationId} ${item.applicationId ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  return <div className="page">
    <PageHeader eyebrow="APPEND-ONLY HISTORY" title="Activity" description="Inspect sanitized audit events across the dashboard, extension, CLI, OpenClaw, and worker." actions={<div className="authority-chip"><ShieldCheck /> Sensitive values redacted</div>} />
    <label className="search-field activity-search"><Search /><span className="sr-only">Search activity</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Event, correlation ID, application…" /></label>
    {activity.isLoading ? <SkeletonRows /> : activity.error ? <ErrorState error={activity.error} retry={() => void activity.refetch()} /> : !values.length ? <EmptyState title="No matching activity" description="Audit events appear after the daemon processes an operation." /> : <section className="activity-stream">{values.map((event) => <article key={event.id}><div className="activity-glyph"><ActivityIcon /></div><div className="activity-body"><header><strong>{friendly(event.type)}</strong><time dateTime={event.at}>{formatTime(event.at)}</time></header><dl><div><dt>Correlation</dt><dd><code>{event.correlationId}</code></dd></div>{event.applicationId && <div><dt>Application</dt><dd><code>{event.applicationId}</code></dd></div>}</dl>{Object.keys(event.detail).length > 0 && <details><summary>Sanitized detail</summary><pre>{JSON.stringify(event.detail, null, 2)}</pre></details>}</div></article>)}</section>}
  </div>;
}
function friendly(value: string) { return value.replaceAll('.', ' / ').replaceAll('_', ' '); }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)); }

