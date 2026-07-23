import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Cable, CheckCircle2, ExternalLink, Hand, Search, ShieldCheck, Wrench } from 'lucide-react';
import { api } from '../lib/api';
import type { Connector } from '../lib/types';
import { EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge } from '../components/UI';

export default function Connectors() {
  const client = useQueryClient();
  const connectors = useQuery({ queryKey: ['connectors'], queryFn: () => api<Connector[]>('/connectors') });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api(`/connectors/${id}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['connectors'] })
  });
  return <div className="page">
    <PageHeader eyebrow="TRUTHFUL CAPABILITY" title="Connectors" description="See exactly which parts of discovery, detail reading, filling, and submission each destination permits." />
    <section className="connector-legend"><span><Search /> Discovery</span><span><Wrench /> Fill</span><span><ShieldCheck /> Submit</span><span><Hand /> Presence</span></section>
    {connectors.isLoading ? <SkeletonRows /> : connectors.error ? <ErrorState error={connectors.error} retry={() => void connectors.refetch()} /> : !connectors.data?.length ? <EmptyState title="No connector policies found" description="The local daemon did not return any registered site policies." /> : <div className="connector-grid">{connectors.data.map((connector) => <ConnectorCard key={connector.policy.connectorId} connector={connector} change={(enabled) => toggle.mutate({ id: connector.policy.connectorId, enabled })} />)}</div>}
  </div>;
}

function ConnectorCard({ connector, change }: { connector: Connector; change: (enabled: boolean) => void }) {
  const { capabilities } = connector.policy;
  const maintained = capabilities.fill === 'automated' || capabilities.fill === 'assisted';
  return <article className={`connector-card panel ${connector.enabled ? '' : 'disabled'}`}><header><div className="connector-logo">{connector.policy.connectorId === 'wuzzuf' ? <Cable /> : maintained ? <Bot /> : <Hand />}</div><div><h2>{title(connector.policy.connectorId)}</h2><p>Policy v{connector.policy.version}</p></div><StatusBadge value={connector.enabled ? 'enabled' : 'disabled'} /></header><div className="capability-grid"><Capability label="Discover" value={capabilities.discovery} /><Capability label="Details" value={capabilities.details} /><Capability label="Fill" value={capabilities.fill} /><Capability label="Submit" value={capabilities.submit} /></div><p className="connector-note">{connector.policy.notes}</p><div className="connector-requirements">{capabilities.requiresUserPresence && <span><Hand /> User presence</span>}{capabilities.requiresSubmissionApproval && <span><ShieldCheck /> Human approval</span>}</div><footer><label className="toggle-row compact"><span>{connector.enabled ? 'Connector enabled' : 'Connector disabled'}</span><input type="checkbox" checked={connector.enabled} disabled={connector.policy.connectorId === 'unsupported'} onChange={(event) => change(event.target.checked)} /></label>{connector.policy.allowedHosts[0] && <a className="icon-button" href={`https://${connector.policy.allowedHosts[0]}`} target="_blank" rel="noreferrer" aria-label={`Open ${title(connector.policy.connectorId)}`}><ExternalLink /></a>}</footer></article>;
}

function Capability({ label, value }: { label: string; value: string }) { const available = !/unsupported/.test(value); return <div><span>{label}</span><strong className={available ? '' : 'muted'}>{available && <CheckCircle2 />}{value.replaceAll('_', ' ')}</strong></div>; }
function title(value: string) { return value.split('-').map((part) => part[0]?.toLocaleUpperCase() + part.slice(1)).join(' '); }

