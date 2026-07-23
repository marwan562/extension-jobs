import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, FileSearch, ShieldCheck, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Application, Page } from '../lib/types';
import { EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge } from '../components/UI';

interface Approval { id: string; applicationId: string; status: string; expiresAt: string; createdAt: string; decidedAt?: string }

export default function Approvals() {
  const client = useQueryClient();
  const approvals = useQuery({ queryKey: ['approvals'], queryFn: () => api<Page<Approval>>('/approvals?status=all&limit=100'), refetchInterval: 15_000 });
  const decision = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => api(`/approvals/${id}/decision`, { method: 'POST', body: JSON.stringify({ approved }) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['approvals'] }); void client.invalidateQueries({ queryKey: ['summary'] }); }
  });
  const submit = useMutation({
    mutationFn: (id: string) => api(`/approvals/${id}/submit`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['approvals'] }); void client.invalidateQueries({ queryKey: ['applications'] }); }
  });
  const pending = approvals.data?.items.filter((item) => item.status === 'pending') ?? [];
  const history = approvals.data?.items.filter((item) => item.status !== 'pending') ?? [];
  return <div className="page">
    <PageHeader eyebrow="HUMAN AUTHORITY" title="Approval Center" description="Compare the reviewed application state, then make one explicit, expiring decision." actions={<div className="authority-chip"><ShieldCheck /> Only this dashboard can decide</div>} />
    <section className="approval-principle"><div className="principle-icon"><FileSearch /></div><div><strong>Approval is bound to what you reviewed.</strong><p>If answers or the form change, the daemon invalidates this decision. Agents never receive the approval token.</p></div></section>
    {approvals.isLoading ? <SkeletonRows /> : approvals.error ? <ErrorState error={approvals.error} retry={() => void approvals.refetch()} /> : !pending.length ? <EmptyState title="No submission decisions waiting" description="A request appears only after a live application is filled, validated, and unchanged." /> : <div className="approval-list">{pending.map((approval) => <ApprovalCard key={approval.id} approval={approval} onDecision={(approved) => decision.mutate({ id: approval.id, approved })} />)}</div>}
    {history.length > 0 && <section className="history-section"><header><p className="eyebrow">DECISION HISTORY</p><h2>Recent approval records</h2></header><div className="history-list">{history.map((approval) => <div key={approval.id}><Clock3 /><div><strong>Application {approval.applicationId.slice(0, 12)}</strong><small>{formatTime(approval.decidedAt ?? approval.createdAt)}</small></div><StatusBadge value={approval.status} />{approval.status === 'approved' && <button className="button primary small" disabled={submit.isPending} onClick={() => submit.mutate(approval.id)}>Submit once</button>}</div>)}</div></section>}
  </div>;
}

function ApprovalCard({ approval, onDecision }: { approval: Approval; onDecision: (approved: boolean) => void }) {
  const application = useQuery({ queryKey: ['application', approval.applicationId, 'approval'], queryFn: () => api<Application>(`/applications/${approval.applicationId}`) });
  const remaining = Math.max(0, Math.ceil((Date.parse(approval.expiresAt) - Date.now()) / 1000));
  return <article className="approval-card panel"><header><div><p className="eyebrow">EXPIRING REVIEW</p><h2>{application.data?.job?.title ?? `Application ${approval.applicationId.slice(0, 10)}`}</h2><p>{application.data?.job?.employer} · {application.data?.job?.location}</p></div><div className="expiry"><Clock3 /><span>{remaining}s</span></div></header>{application.isLoading ? <SkeletonRows count={2} /> : application.error ? <ErrorState error={application.error} /> : application.data && <><div className="approval-facts"><div><span>Workflow state</span><StatusBadge value={application.data.state} /></div><div><span>Fill mode</span><strong>{application.data.dryRun ? 'Dry run' : 'Live'}</strong></div><div><span>Validation issues</span><strong>{application.data.validationErrors?.length ?? 0}</strong></div><div><span>Skipped fields</span><strong>{application.data.skippedFields?.length ?? 0}</strong></div></div><section><h3>Reviewed answers</h3><div className="answer-review">{application.data.answers?.length ? application.data.answers.map((answer) => <div key={answer.fieldId}><span>{answer.label}</span><strong>{answer.value || (answer.confirmationRequired ? 'Sensitive value withheld in list view' : 'No value')}</strong><small>{Math.round(answer.confidence * 100)}% confidence {answer.confirmationRequired ? '· confirmation required' : ''}</small></div>) : <p className="muted">No answer preview available.</p>}</div></section></>}<footer><button className="button ghost danger-quiet" onClick={() => onDecision(false)}><X /> Reject</button><button className="button primary" onClick={() => onDecision(true)}><Check /> Approve reviewed state</button></footer></article>;
}

function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

