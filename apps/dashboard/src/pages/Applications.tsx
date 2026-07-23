import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Ban, Columns3, List, Play, ShieldCheck, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Application, ManualAction, Page } from '../lib/types';
import { EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge } from '../components/UI';

const column = createColumnHelper<Application>();
const stages = [
  { label: 'Preparing', states: ['DISCOVERED', 'NORMALIZED', 'SCORED', 'SELECTED', 'PREPARING', 'APPLICATION_INSPECTING'] },
  { label: 'Review', states: ['AWAITING_REVIEW', 'APPLICATION_REVIEW_REQUIRED', 'RESUME_REVIEW_REQUIRED', 'APPROVED_FOR_FILL'] },
  { label: 'Ready', states: ['FILLED', 'VALIDATING', 'AWAITING_SUBMISSION_APPROVAL', 'READY_TO_SUBMIT'] },
  { label: 'Complete', states: ['SUBMITTED'] },
  { label: 'Needs action', states: ['AUTH_REQUIRED', 'SECURITY_CHALLENGE_REQUIRED', 'SECURITY_CHECK_REQUIRED', 'FORM_CHANGED', 'POLICY_BLOCKED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT'] }
];

export default function Applications() {
  const [view, setView] = useState<'table' | 'board'>('table');
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const applications = useQuery({ queryKey: ['applications'], queryFn: () => api<Page<Application>>('/applications?limit=100') });
  const manualActions = useQuery({ queryKey: ['manual-actions'], queryFn: () => api<Page<ManualAction>>('/manual-actions?status=open&limit=100') });
  const detail = useQuery({ queryKey: ['application', applicationId], queryFn: () => api<Application>(`/applications/${applicationId}`), enabled: Boolean(applicationId) });
  const timeline = useQuery({ queryKey: ['application-timeline', applicationId], queryFn: () => api<{ transitions: Array<{ previousState: string; nextState: string; actor: string; createdAt: string }>; audit: Array<{ id: string; type: string; at: string }> }>(`/applications/${applicationId}/timeline`), enabled: Boolean(applicationId) });
  const manualAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'continue' | 'cancel' }) => api<ManualAction>(`/manual-actions/${id}/${action}`, { method: 'POST' }),
    onSuccess: (item: ManualAction) => {
      void client.invalidateQueries({ queryKey: ['manual-actions'] });
      void client.invalidateQueries({ queryKey: ['applications'] });
      void client.invalidateQueries({ queryKey: ['summary'] });
      if (item.applicationId) navigate(`/applications/${item.applicationId}`);
    }
  });
  const columns = useMemo(() => [
    column.accessor('job', { header: 'Role', cell: (info) => <button className="job-title-button" onClick={() => navigate(`/applications/${info.row.original.id}`)}><strong>{info.getValue()?.title ?? 'Application'}</strong><span>{info.getValue()?.employer ?? info.row.original.jobId}</span></button> }),
    column.accessor('state', { header: 'State', cell: (info) => <StatusBadge value={info.getValue()} /> }),
    column.accessor('dryRun', { header: 'Mode', cell: (info) => info.getValue() ? <span className="source-chip">Dry run</span> : <span className="source-chip live">Live</span> }),
    column.accessor('updatedAt', { header: 'Updated', cell: (info) => info.getValue() ? formatTime(info.getValue()!) : '—' }),
    column.accessor('errors', { header: 'Issues', cell: (info) => info.getValue().length ? <StatusBadge value={`${info.getValue().length} issues`} /> : <span className="muted">Clear</span> })
  ], [navigate]);
  const table = useReactTable({ data: applications.data?.items ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return <div className="page">
    <PageHeader eyebrow="DURABLE WORKFLOW" title="Applications" description="Follow every state transition, review, and handoff from one auditable workspace." actions={<div className="segmented" aria-label="Application view"><button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}><List /> Table</button><button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}><Columns3 /> Board</button></div>} />
    {manualActions.data?.items.length ? <section className="manual-inbox" aria-labelledby="manual-inbox-title"><header><div><p className="eyebrow">MANUAL ACTION INBOX</p><h2 id="manual-inbox-title">Your browser needs attention</h2></div><span>{manualActions.data.total} open</span></header><div>{manualActions.data.items.map((item) => <article key={item.id}><div><StatusBadge value={item.kind} /><strong>{item.title}</strong><p>{String(item.detail.state ?? 'Resume the protected browser workflow when ready.')}</p></div><footer><button className="button ghost small" disabled={manualAction.isPending} onClick={() => manualAction.mutate({ id: item.id, action: 'cancel' })}><Ban /> Cancel workflow</button><button className="button primary small" disabled={manualAction.isPending} onClick={() => manualAction.mutate({ id: item.id, action: 'continue' })}><Play /> Continue manually</button></footer></article>)}</div></section> : null}
    {manualActions.error && <ErrorState error={manualActions.error} retry={() => void manualActions.refetch()} />}
    {applications.isLoading ? <SkeletonRows /> : applications.error ? <ErrorState error={applications.error} retry={() => void applications.refetch()} /> : !applications.data?.items.length ? <EmptyState title="No applications yet" description="Shortlist a supported job, then prepare it through the daemon-owned workflow." /> : view === 'table' ? (
      <section className="table-panel"><div className="table-toolbar"><strong>{applications.data.total} tracked workflows</strong><span>Durable state · restart safe</span></div><div className="table-scroll"><table><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div></section>
    ) : <Kanban applications={applications.data.items} open={(id) => navigate(`/applications/${id}`)} />}
    {applicationId && <div className="detail-scrim" onMouseDown={(event) => { if (event.currentTarget === event.target) navigate('/applications'); }}><aside className="detail-panel" aria-label="Application details"><header><span>Application record</span><button className="icon-button" onClick={() => navigate('/applications')} aria-label="Close details"><X /></button></header>{detail.isLoading ? <SkeletonRows /> : detail.error ? <ErrorState error={detail.error} /> : detail.data && <ApplicationDetail application={detail.data} timeline={timeline.data} />}</aside></div>}
  </div>;
}

function Kanban({ applications, open }: { applications: Application[]; open: (id: string) => void }) {
  return <div className="kanban" aria-label="Application board">{stages.map((stage) => { const items = applications.filter((item) => stage.states.includes(item.state)); return <section key={stage.label}><header><h2>{stage.label}</h2><span>{items.length}</span></header><div>{items.map((item) => <button className="kanban-card" key={item.id} onClick={() => open(item.id)}><strong>{item.job?.title ?? 'Application'}</strong><span>{item.job?.employer ?? item.jobId}</span><StatusBadge value={item.state} /></button>)}{!items.length && <p className="kanban-empty">No items</p>}</div></section>; })}</div>;
}

function ApplicationDetail({ application, timeline }: { application: Application; timeline?: { transitions: Array<{ previousState: string; nextState: string; actor: string; createdAt: string }>; audit: Array<{ id: string; type: string; at: string }> } }) {
  const client = useQueryClient();
  const fill = useMutation({
    mutationFn: () => api(`/applications/${application.id}/fill`, { method: 'POST', body: JSON.stringify({ dryRun: application.dryRun !== false, idempotencyKey: crypto.randomUUID() }) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['applications'] }); void client.invalidateQueries({ queryKey: ['application', application.id] }); void client.invalidateQueries({ queryKey: ['application-timeline', application.id] }); }
  });
  const requestApproval = useMutation({
    mutationFn: () => api(`/applications/${application.id}/request-approval`, { method: 'POST', body: JSON.stringify({ ttlSeconds: 120, idempotencyKey: crypto.randomUUID() }) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['approvals'] }); void client.invalidateQueries({ queryKey: ['summary'] }); }
  });
  const canFill = !['SUBMITTED', 'CANCELLED', 'FAILED_PERMANENT'].includes(application.state);
  return <div className="application-detail"><div className="detail-heading"><p className="eyebrow">APPLICATION</p><h2>{application.job?.title ?? application.jobId}</h2><p>{application.job?.employer} · {application.job?.location}</p><StatusBadge value={application.state} /></div><div className="review-banner"><ShieldCheck /><div><strong>{application.dryRun ? 'Dry-run protected' : 'Human approval required'}</strong><p>Final submission cannot happen from an agent or unattended campaign.</p></div></div><div className="detail-actions"><button className="button ghost" disabled={!canFill || fill.isPending} onClick={() => { if (application.dryRun !== false || window.confirm('Fill the live browser form with the reviewed, non-sensitive answers? This still will not submit.')) fill.mutate(); }}><Play /> {application.dryRun === false ? 'Fill live form' : 'Run dry fill'}</button>{application.submissionAllowed && <button className="button primary" disabled={requestApproval.isPending} onClick={() => requestApproval.mutate()}><ShieldCheck /> Request 2-minute approval</button>}</div>{(fill.error || requestApproval.error) && <p className="form-error" role="alert">{(fill.error ?? requestApproval.error)?.message}</p>}<section><h3>Review state</h3><dl className="fact-grid"><div><dt>Filled fields</dt><dd>{application.filledFields?.length ?? 0}</dd></div><div><dt>Skipped fields</dt><dd>{application.skippedFields?.length ?? 0}</dd></div><div><dt>Validation issues</dt><dd>{application.validationErrors?.length ?? 0}</dd></div><div><dt>Sensitive fields</dt><dd>{application.sensitiveFields?.length ?? 0}</dd></div></dl></section>{application.answers?.length ? <section><h3>Prepared answers</h3><div className="answer-review">{application.answers.map((answer) => <div key={answer.fieldId || answer.label}><span>{answer.label}</span><strong>{answer.value || 'No value'}</strong><small>{Math.round(answer.confidence * 100)}% confidence {answer.confirmationRequired ? '· confirmation required' : ''}</small></div>)}</div></section> : null}<section><h3>State timeline</h3>{timeline?.transitions.length ? <ol className="state-timeline">{timeline.transitions.map((event, index) => <li key={`${event.createdAt}-${index}`}><span /><div><strong>{event.previousState} → {event.nextState}</strong><small>{event.actor} · {formatTime(event.createdAt)}</small></div></li>)}</ol> : <p className="muted">No transition events have been recorded.</p>}</section>{application.errors.length > 0 && <section><h3>Issues</h3><div className="issue-list">{application.errors.map((error, index) => <div key={index}><StatusBadge value={error.code ?? 'issue'} /><p>{error.message}</p></div>)}</div></section>}</div>;
}

function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
