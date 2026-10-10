import { useState } from 'react';
import { ServerDownload } from '../components/ServerDownload';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/apiClient';
import { PageHeader } from '../components/ui';
import { useAuthStore } from '../stores/authStore';

interface AuditRow { id: string; userId: string | null; eventType: string; description: string; createdAt: string; metadataJson: string | null }
export default function AuditPage() {
  const user = useAuthStore(s => s.user); const allowed = ['Owner', 'Admin', 'SuperAdmin'].includes(user?.currentBusiness?.role ?? '');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [action, setAction] = useState(''); const [actor, setActor] = useState(''); const [page, setPage] = useState(1);
  const params = { from: from ? `${from}T00:00:00Z` : undefined, to: to ? `${to}T23:59:59.999Z` : undefined, actor: actor || undefined, action, page, pageSize: 50 };
  const query = useQuery({ queryKey: ['audit', user?.currentBusiness?.businessId, params], queryFn: async () => (await apiClient.get<{ items: AuditRow[]; totalCount: number }>('/audit', { params })).data, enabled: allowed });
  if (!allowed) return <p role="alert">Audit history is available to the business owner or admin.</p>;
  return <div className="space-y-4"><PageHeader title="Audit history" subtitle="Read-only records of business activity. Dates and times are UTC." />
    <ServerDownload path="/exports/audit.csv" filename="audit.csv" label="Export filtered audit CSV" params={params} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['From', 'date', from, setFrom], ['To', 'date', to, setTo], ['Action', 'text', action, setAction], ['User ID', 'text', actor, setActor]].map(([label, type, value, setter]) => <label key={label as string} className="text-sm">{label as string}<input className="block border rounded p-2 w-full mt-1" type={type as string} value={value as string} maxLength={100} onChange={e => { (setter as (v: string) => void)(e.target.value); setPage(1); }} /></label>)}</div>
    {query.isPending && <p role="status">Loading audit history…</p>}{query.isError && <p role="alert">Audit history could not be loaded. Check the filters and <button className="underline" onClick={() => void query.refetch()}>retry</button>.</p>}
    {query.data && <><p className="text-sm">{query.data.totalCount} records</p>{query.data.items.length === 0 && <p>No activity matches these filters.</p>}<div className="space-y-3">{query.data.items.map(row => <article className="bg-white border rounded-xl p-4 space-y-2 min-w-0" key={row.id}><p className="font-semibold break-words">{row.eventType}</p><p className="text-sm">{row.createdAt.replace('T', ' ').slice(0, 19)} UTC</p><p className="text-sm break-all">{row.description}</p><p className="text-sm break-all">User: {row.userId ?? 'System'}</p>{row.metadataJson && <details><summary className="cursor-pointer text-sm">Changes</summary><pre className="text-xs whitespace-pre-wrap break-all p-2 bg-slate-50 mt-2">{row.metadataJson}</pre></details>}</article>)}</div><div className="flex gap-4 items-center"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button disabled={page * 50 >= query.data.totalCount} onClick={() => setPage(p => p + 1)}>Next</button></div></>}
  </div>;
}
