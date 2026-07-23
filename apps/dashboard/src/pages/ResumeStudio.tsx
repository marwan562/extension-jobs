import { type ChangeEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, FileDiff, FileText, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { api } from '../lib/api';
import type { ResumeSource, TailoredResume } from '../lib/types';
import { EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge } from '../components/UI';

export default function ResumeStudio() {
  const client = useQueryClient();
  const [active, setActive] = useState('');
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: () => api<{ sources: ResumeSource[]; tailored: TailoredResume[] }>('/resumes') });
  const selected = useMemo(() => resumes.data?.sources.find((item) => item.source.id === active) ?? resumes.data?.sources[0], [resumes.data, active]);
  const upload = useMutation({
    mutationFn: async (file: File) => api('/resumes/import', { method: 'POST', body: JSON.stringify({ sourceName: file.name, base64: await base64(file) }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['resumes'] })
  });
  const approve = useMutation({
    mutationFn: (id: string) => api(`/resumes/${id}/approve`, { method: 'POST' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['resumes'] })
  });
  const tailoredApprove = useMutation({
    mutationFn: (id: string) => api(`/tailored-resumes/${id}/approve`, { method: 'POST' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['resumes'] })
  });
  const tailoredReject = useMutation({
    mutationFn: (id: string) => api(`/tailored-resumes/${id}/reject`, { method: 'POST' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['resumes'] })
  });
  function choose(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ''; }

  return <div className="page">
    <PageHeader eyebrow="VERIFIED PROFILE" title="Resume Studio" description="Import locally, inspect extracted facts, review tailoring changes, and approve only what is true." actions={<label className="button primary file-button"><UploadCloud /> Import resume<input type="file" accept=".pdf,.docx,.md,.txt,.json,.yaml,.yml" onChange={choose} /></label>} />
    {upload.error && <ErrorState error={upload.error} />}
    {resumes.isLoading ? <SkeletonRows /> : resumes.error ? <ErrorState error={resumes.error} retry={() => void resumes.refetch()} /> : !resumes.data?.sources.length ? <EmptyState title="Start with an approved source" description="Import a PDF, DOCX, Markdown, text, JSON, or YAML resume. Files are copied into the local artifact vault." action={<label className="button primary file-button"><UploadCloud /> Choose a resume<input type="file" onChange={choose} /></label>} /> : (
      <div className="resume-layout">
        <aside className="resume-list panel"><p className="eyebrow">SOURCE LIBRARY</p>{resumes.data.sources.map((resume) => <button className={selected?.source.id === resume.source.id ? 'active' : ''} key={resume.source.id} onClick={() => setActive(resume.source.id)}><span className="file-glyph"><FileText /></span><div><strong>{resume.source.displayName}</strong><small>{formatBytes(resume.source.size)} · {resume.facts.length} facts</small></div><StatusBadge value={resume.source.approved ? 'approved' : 'review'} /></button>)}</aside>
        <section className="resume-workbench">
          {selected && <><article className="panel resume-summary"><div><p className="eyebrow">CANONICAL SOURCE</p><h2>{selected.source.displayName}</h2><p>{selected.source.mediaType} · imported {formatDate(selected.source.createdAt)}</p></div>{selected.source.approved ? <div className="approved-seal"><ShieldCheck /><span>Approved source</span></div> : <button className="button primary" onClick={() => approve.mutate(selected.source.id)}><Check /> Approve verified facts</button>}</article><article className="panel fact-inspector"><header className="panel-header"><div><p className="eyebrow">FACT INSPECTOR</p><h2>Extracted evidence</h2></div><span className="panel-kicker">{selected.facts.length} records</span></header><div className="fact-list">{selected.facts.map((fact) => <details key={fact.id}><summary><div><strong>{fact.path}</strong><span>{String(fact.value)}</span></div><div><StatusBadge value={fact.status} /><ChevronDown /></div></summary><dl><div><dt>Confidence</dt><dd>{Math.round(fact.confidence * 100)}%</dd></div><div><dt>Source</dt><dd>{fact.sourceLocation ?? 'Imported resume'}</dd></div><div><dt>Fact ID</dt><dd><code>{fact.id}</code></dd></div></dl></details>)}</div></article></>}
          <article className="panel tailoring"><header className="panel-header"><div><p className="eyebrow">TAILORING REVIEWS</p><h2>Changes that need a human</h2></div><FileDiff /></header>{resumes.data.tailored.length ? <div className="tailored-list">{resumes.data.tailored.map((item) => <section key={item.tailoredResume.id}><header><div><strong>Job {item.tailoredResume.jobId.slice(0, 12)}</strong><small>{item.review.missingRequirements.length} missing requirements</small></div><StatusBadge value={item.tailoredResume.approved ? 'approved' : 'review required'} /></header><div className="diff-list">{item.tailoredResume.tailoringPlan.slice(0, 5).map((change, index) => <div key={index}><span>{change.kind}</span><div><strong>{change.section}</strong>{change.before && <del>{change.before}</del>}{change.after && <ins>{change.after}</ins>}</div></div>)}</div><footer>{item.tailoredResume.pdfArtifactId && <a className="button ghost" href={`/v1/dashboard/artifacts/${item.tailoredResume.pdfArtifactId}/content`} target="_blank" rel="noreferrer"><FileText /> Preview PDF</a>}{!item.tailoredResume.approved && <><button className="button ghost danger-quiet" disabled={tailoredReject.isPending} onClick={() => tailoredReject.mutate(item.tailoredResume.id)}><X /> Reject</button><button className="button primary" disabled={tailoredApprove.isPending} onClick={() => tailoredApprove.mutate(item.tailoredResume.id)}><Check /> Approve variant</button></>}</footer></section>)}</div> : <EmptyState title="No tailored variants" description="Tailoring reviews appear after a supported job is prepared against this approved source." />}</article>
        </section>
      </div>
    )}
  </div>;
}

function base64(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)); }
