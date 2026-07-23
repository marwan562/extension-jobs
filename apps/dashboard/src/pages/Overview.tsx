import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BellRing, BriefcaseBusiness, CircleCheck, Clock3, FileCheck2, ShieldAlert, Sparkles, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Page, Summary } from '../lib/types';
import { EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge } from '../components/UI';

interface ActivityEvent { id: string; type: string; at: string; detail: Record<string, unknown> }

export default function Overview() {
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/summary') });
  const activity = useQuery({ queryKey: ['activity', 'overview'], queryFn: () => api<Page<ActivityEvent>>('/activity?limit=6') });
  if (summary.error) return <div className="page"><ErrorState error={summary.error} retry={() => void summary.refetch()} /></div>;
  const data = summary.data;
  return (
    <div className="page">
      <PageHeader eyebrow="PRIVATE OPERATIONS" title="Good decisions, clearly queued." description="A live view of jobs, reviews, and automation running through your local daemon." actions={<Link className="button primary" to="/jobs"><BriefcaseBusiness /> Explore jobs</Link>} />
      {!data ? <SkeletonRows count={4} /> : (
        <>
          <section className="metric-grid" aria-label="Pipeline metrics">
            <Metric icon={<BriefcaseBusiness />} label="Jobs discovered" value={data.counts.jobs} note="Stored locally" />
            <Metric icon={<Sparkles />} label="Shortlisted" value={data.counts.shortlisted} note={`${ratio(data.counts.shortlisted, data.counts.jobs)} of jobs`} accent />
            <Metric icon={<FileCheck2 />} label="Applications" value={data.counts.applications} note="Prepared and tracked" />
            <Metric icon={<ShieldAlert />} label="Awaiting you" value={data.counts.approvals + data.counts.manualActions} note={`${data.counts.approvals} approval reviews`} warning={data.counts.approvals > 0} />
          </section>
          <section className="overview-grid">
            <article className="panel attention-panel">
              <header className="panel-header"><div><p className="eyebrow">ATTENTION QUEUE</p><h2>What needs you now</h2></div><BellRing /></header>
              {data.attention.length ? <div className="attention-list">{data.attention.map((item) => <Link to={item.kind === 'approval' ? '/approvals' : item.kind === 'manual_action' ? '/applications' : '/settings'} key={item.id}><span className={`attention-symbol ${item.kind}`}><Clock3 /></span><div><strong>{item.title}</strong><small>{item.detail}</small></div><ArrowUpRight /></Link>)}</div> : <EmptyState title="Nothing waiting" description="Approvals and manual handoffs will appear here." />}
            </article>
            <article className="panel distribution-panel">
              <header className="panel-header"><div><p className="eyebrow">MATCH QUALITY</p><h2>Signal distribution</h2></div><span className="panel-kicker">{data.counts.jobs} roles</span></header>
              <div className="bar-chart" role="img" aria-label={`Match distribution: ${data.matchDistribution.map((item) => `${item.label}, ${item.count}`).join('; ')}`}>
                {data.matchDistribution.map((item) => { const max = Math.max(...data.matchDistribution.map((entry) => entry.count), 1); return <div className="bar-column" key={item.label}><span className="bar-value">{item.count}</span><div><i style={{ height: `${Math.max(8, item.count / max * 100)}%` }} /></div><small>{item.label}</small></div>; })}
              </div>
            </article>
            <article className="panel activity-panel">
              <header className="panel-header"><div><p className="eyebrow">AUDIT STREAM</p><h2>Recent activity</h2></div><Link to="/activity">View all</Link></header>
              {activity.data?.items.length ? <ol className="timeline">{activity.data.items.map((event) => <li key={event.id}><span /><div><strong>{friendly(event.type)}</strong><small>{formatTime(event.at)}</small></div></li>)}</ol> : <EmptyState title="Quiet so far" description="Actions taken through any trusted client appear here." />}
            </article>
            <article className="panel campaign-panel">
              <header className="panel-header"><div><p className="eyebrow">CAMPAIGN PULSE</p><h2>Search loops</h2></div><Target /></header>
              {data.campaignPulse.length ? <div className="campaign-list">{data.campaignPulse.map((campaign) => <Link to="/campaigns" key={campaign.id}><div><strong>{campaign.name}</strong><small>Updated {formatTime(campaign.updatedAt)}</small></div><StatusBadge value={campaign.state} /></Link>)}</div> : <EmptyState title="No campaigns yet" description="Build a constrained search campaign when you are ready." action={<Link className="button ghost" to="/campaigns">Create campaign</Link>} />}
              <div className="local-trust"><CircleCheck /><div><strong>Daemon-owned safeguards</strong><span>Daily limits, durable queue, idempotency, and approval rules are active.</span></div></div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ icon, label, value, note, accent, warning }: { icon: React.ReactNode; label: string; value: number; note: string; accent?: boolean; warning?: boolean }) {
  return <article className={`metric-card ${accent ? 'accent' : ''} ${warning ? 'warning' : ''}`}><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value.toLocaleString()}</strong><small>{note}</small></div></article>;
}
function ratio(value: number, total: number) { return total ? `${Math.round(value / total * 100)}%` : '0%'; }
function friendly(value: string) { return value.replaceAll('.', ' · ').replaceAll('_', ' '); }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

