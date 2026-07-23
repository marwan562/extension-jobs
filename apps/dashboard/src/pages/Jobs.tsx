import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, type VisibilityState } from '@tanstack/react-table';
import { Bookmark, ChevronLeft, Columns3, ExternalLink, Filter, ListFilter, Save, Search, Sparkles, Tags, X } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Job, Page, ResumeSource } from '../lib/types';
import { EmptyState, ErrorState, PageHeader, ScoreRing, SkeletonRows, StatusBadge } from '../components/UI';

const column = createColumnHelper<Job>();

export default function Jobs() {
  const [params, setParams] = useSearchParams();
  const { jobId } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [tag, setTag] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const query = params.toString();
  const jobs = useQuery({ queryKey: ['jobs', query], queryFn: () => api<Page<Job>>(`/jobs?${query}`) });
  const views = useQuery({ queryKey: ['job-views'], queryFn: () => api<Array<{ id: string; name: string; query: Record<string, string> }>>('/jobs/views') });
  const detail = useQuery({ queryKey: ['job', jobId], queryFn: () => api<Job & { connector: unknown }>(`/jobs/${jobId}`), enabled: Boolean(jobId) });
  const decision = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'shortlist' | 'reject' }) => api(`/jobs/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['jobs'] }); void client.invalidateQueries({ queryKey: ['job'] }); void client.invalidateQueries({ queryKey: ['summary'] }); }
  });
  const bulk = useMutation({
    mutationFn: (action: string) => api('/jobs/bulk', { method: 'POST', body: JSON.stringify({ ids: Object.keys(selected).filter((id) => selected[id]), action, ...(action === 'tag' ? { tags: [tag] } : {}) }) }),
    onSuccess: () => { setSelected({}); setTag(''); void client.invalidateQueries({ queryKey: ['jobs'] }); }
  });
  const saveView = useMutation({
    mutationFn: () => api('/jobs/views', { method: 'POST', body: JSON.stringify({ name: `View ${new Date().toLocaleDateString()} · ${views.data?.length ? views.data.length + 1 : 1}`, query: Object.fromEntries(params.entries()) }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['job-views'] })
  });

  const columns = useMemo(() => [
    column.display({ id: 'select', header: () => <span className="sr-only">Select</span>, cell: ({ row }) => <input aria-label={`Select ${row.original.title}`} type="checkbox" checked={Boolean(selected[row.original.id])} onChange={(event) => setSelected((value) => ({ ...value, [row.original.id]: event.target.checked }))} /> }),
    column.accessor('matchScore', { header: 'Match', cell: (info) => <ScoreRing score={info.getValue()} size="small" /> }),
    column.accessor('title', { header: 'Role', cell: (info) => <button className="job-title-button" onClick={() => navigate(`/jobs/${info.row.original.id}?${query}`)}><strong>{info.getValue()}</strong><span>{info.row.original.employer}</span></button> }),
    column.accessor('location', { header: 'Location', cell: (info) => <><span>{info.getValue()}</span>{info.row.original.remote && <small className="table-subtle">Remote</small>}</> }),
    column.accessor('source', { header: 'Source', cell: (info) => <span className="source-chip">{info.getValue()}</span> }),
    column.accessor('applicationState', { header: 'Workflow', cell: (info) => info.getValue() ? <StatusBadge value={info.getValue()!} /> : <span className="muted">Not started</span> }),
    column.accessor('disposition', { header: 'Decision', cell: (info) => info.getValue() ? <StatusBadge value={info.getValue()!} /> : <span className="muted">Unreviewed</span> })
  ], [navigate, query, selected]);
  const table = useReactTable({ data: jobs.data?.items ?? [], columns, state: { columnVisibility }, onColumnVisibilityChange: setColumnVisibility, getCoreRowModel: getCoreRowModel() });
  const selectedCount = Object.values(selected).filter(Boolean).length;

  function update(name: string, value: string) {
    setParams((current) => { const next = new URLSearchParams(current); value ? next.set(name, value) : next.delete(name); next.delete('cursor'); return next; });
  }

  return (
    <div className="page">
      <PageHeader eyebrow="DISCOVERY LIBRARY" title="Jobs Explorer" description="Search, score, and organize roles without leaving the daemon-owned workflow." actions={<button className="button ghost" onClick={() => void jobs.refetch()}><Sparkles /> Refresh data</button>} />
      <section className="filter-bar" aria-label="Job filters">
        <label className="search-field"><Search /><span className="sr-only">Search jobs</span><input value={params.get('q') ?? ''} onChange={(event) => update('q', event.target.value)} placeholder="Role, company, keyword…" /></label>
        <label><span className="sr-only">Minimum score</span><select value={params.get('minScore') ?? ''} onChange={(event) => update('minScore', event.target.value)}><option value="">Any match</option><option value="80">80+ strong</option><option value="60">60+ possible</option><option value="40">40+ broad</option></select></label>
        <label><span className="sr-only">Decision</span><select value={params.get('disposition') ?? ''} onChange={(event) => update('disposition', event.target.value)}><option value="">All decisions</option><option value="shortlisted">Shortlisted</option><option value="rejected">Rejected</option></select></label>
        <label><span className="sr-only">Sort</span><select value={params.get('sort') ?? 'newest'} onChange={(event) => update('sort', event.target.value)}><option value="newest">Newest first</option><option value="score">Best match</option></select></label>
        <label><span className="sr-only">Saved view</span><select value="" onChange={(event) => { const view = views.data?.find((item) => item.id === event.target.value); if (view) setParams(new URLSearchParams(view.query)); }}><option value="">Saved views</option>{views.data?.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
        <button className="icon-button" title="Save current view" aria-label="Save current view" disabled={saveView.isPending} onClick={() => saveView.mutate()}><Save /></button>
        <button className="icon-button" title="Clear filters" aria-label="Clear filters" onClick={() => setParams({})}><X /></button>
      </section>
      {selectedCount > 0 && <div className="bulk-bar"><strong>{selectedCount} selected</strong><span>Safe bulk actions only</span><button className="button ghost" onClick={() => bulk.mutate('shortlist')}><Bookmark /> Shortlist</button><button className="button ghost" onClick={() => bulk.mutate('reject')}>Reject</button><label className="bulk-tag"><span className="sr-only">Tag selected jobs</span><input maxLength={40} value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Add tag" /></label><button className="button ghost" disabled={!tag.trim()} onClick={() => bulk.mutate('tag')}><Tags /> Tag</button></div>}
      <section className="table-panel">
        <div className="table-toolbar"><div><ListFilter /><strong>{jobs.data?.total ?? 0} jobs</strong></div><div className="column-controls"><span>Server-filtered · cursor-paginated</span><details><summary><Columns3 /> Columns</summary><div>{table.getAllLeafColumns().filter((item) => item.id !== 'select').map((item) => <label key={item.id}><input type="checkbox" checked={item.getIsVisible()} onChange={item.getToggleVisibilityHandler()} /> {item.id.replaceAll('_', ' ')}</label>)}</div></details></div></div>
        {jobs.isLoading ? <SkeletonRows /> : jobs.error ? <ErrorState error={jobs.error} retry={() => void jobs.refetch()} /> : jobs.data?.items.length ? (
          <div className="table-scroll"><table><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div>
        ) : <EmptyState title="No jobs match this view" description="Try broadening the filters or run a constrained campaign." />}
        {jobs.data?.nextCursor && <div className="pagination"><button className="button ghost" onClick={() => update('cursor', jobs.data!.nextCursor!)}>Load next page</button></div>}
      </section>
      {jobId && <div className="detail-scrim" onMouseDown={(event) => { if (event.currentTarget === event.target) navigate(`/jobs?${query}`); }}><aside className="detail-panel" aria-label="Job details"><header><button className="icon-button" onClick={() => navigate(`/jobs?${query}`)} aria-label="Close details"><ChevronLeft /></button><span>Role intelligence</span><button className="icon-button" onClick={() => navigate(`/jobs?${query}`)} aria-label="Close details"><X /></button></header>{detail.isLoading ? <SkeletonRows /> : detail.error ? <ErrorState error={detail.error} /> : detail.data && <JobDetail job={detail.data} decision={(action) => decision.mutate({ id: detail.data!.id, action })} />}</aside></div>}
    </div>
  );
}

function JobDetail({ job, decision }: { job: Job; decision: (action: 'shortlist' | 'reject') => void }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [note, setNote] = useState(job.note ?? '');
  const resumes = useQuery({ queryKey: ['resumes', 'job-detail'], queryFn: () => api<{ sources: ResumeSource[] }>('/resumes') });
  const approved = resumes.data?.sources.find((item) => item.source.approved);
  const tailor = useMutation({ mutationFn: () => api(`/jobs/${job.id}/tailor`, { method: 'POST', body: JSON.stringify({ resumeId: approved?.source.id, idempotencyKey: crypto.randomUUID() }) }), onSuccess: () => navigate('/resume-studio') });
  const prepare = useMutation({ mutationFn: (dryRun: boolean) => api(`/jobs/${job.id}/prepare`, { method: 'POST', body: JSON.stringify({ profileId: approved?.source.profileId, dryRun, idempotencyKey: crypto.randomUUID() }) }), onSuccess: () => navigate('/applications') });
  const saveNote = useMutation({
    mutationFn: () => api(`/jobs/${job.id}/note`, { method: 'PUT', body: JSON.stringify({ note, version: job.noteVersion ?? 0 }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['job', job.id] })
  });
  return <div className="job-detail"><div className="detail-hero"><ScoreRing score={job.matchScore} /><div><p className="eyebrow">{job.source}</p><h2>{job.title}</h2><p>{job.employer} · {job.location}{job.remote ? ' · Remote' : ''}</p></div></div><div className="detail-actions"><button className="button primary" onClick={() => decision('shortlist')}><Bookmark /> Shortlist</button><button className="button ghost" disabled={!approved || tailor.isPending} onClick={() => tailor.mutate()}><Sparkles /> Tailor resume</button><button className="button ghost" disabled={!approved || prepare.isPending} onClick={() => prepare.mutate(true)}>Prepare dry run</button><button className="button ghost" disabled={!approved || prepare.isPending} onClick={() => { if (window.confirm('Prepare a live browser form? This will fill nothing and can never submit without a later explicit approval.')) prepare.mutate(false); }}>Prepare live</button><a className="icon-button" href={job.url} target="_blank" rel="noreferrer" aria-label="Open original job"><ExternalLink /></a></div>{(tailor.error || prepare.error) && <p className="form-error" role="alert">{(tailor.error ?? prepare.error)?.message}</p>}<section><h3>Why it matches</h3><div className="explanation-list">{job.scoreExplanation.length ? job.scoreExplanation.map((item) => <div key={`${item.factor}-${item.reason}`}><span className={item.points >= 0 ? 'positive' : 'negative'}>{item.points > 0 ? '+' : ''}{item.points}</span><div><strong>{item.factor}</strong><p>{item.reason}</p></div></div>) : <p className="muted">Score the job against an approved profile to see a detailed explanation.</p>}</div></section><section><h3>Private note</h3><label className="note-editor"><span className="sr-only">Private job note</span><textarea maxLength={5_000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add local context, interview notes, or a follow-up reminder…" /></label><button className="button ghost small" disabled={saveNote.isPending || note === (job.note ?? '')} onClick={() => saveNote.mutate()}><Save /> Save note</button>{saveNote.error && <p className="form-error" role="alert">{saveNote.error.message}</p>}</section><section><h3>Role description</h3><p className="job-description">{job.description}</p></section><section className="capability-note"><Filter /><div><strong>Automation remains policy-bound</strong><p>Preparing this application delegates to the maintained connector. Playwright and submission controls never run in this dashboard.</p></div></section></div>;
}
