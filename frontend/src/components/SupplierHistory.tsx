import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { formatMoney } from '../lib/formatMoney';
import { Button, Input, ErrorState } from './ui';
import { RecordCard, RecordFields } from './ui/ResponsiveRecords';

export function SupplierHistory({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = { page, from: from ? `${from}T00:00:00Z` : undefined, to: to ? `${to}T23:59:59.999999Z` : undefined };
  const query = useQuery({
    queryKey: ['supplier-history', id, params],
    queryFn: async () => (await apiClient.get<{
      items: { id: string; orderNumber: string; createdAt: string; status: string; grandTotal?: number; paidAmount?: number }[];
      totalCount: number; totalSpend?: number; totalPaid?: number;
    }>(`/catalog/suppliers/${id}/history`, { params })).data,
  });
  return <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Input label="From (UTC)" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} />
      <Input label="To (UTC)" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} />
    </div>
    {query.isPending && <p role="status">Loading supplier purchases…</p>}
    {query.isError && <ErrorState message="History unavailable." onRetry={() => void query.refetch()} />}
    {query.data && <>
      <p className="text-sm">{query.data.totalCount} purchases (draft and cancelled orders excluded)</p>
      {query.data.totalSpend !== undefined && <RecordFields fields={[
        { label: 'Total spend', value: formatMoney(query.data.totalSpend) },
        { label: 'Total paid', value: formatMoney(query.data.totalPaid) },
      ]} />}
      {query.data.items.length === 0 && <p className="text-sm text-gray-500">No purchases in this range.</p>}
      <div className="space-y-3">{query.data.items.map(p => <RecordCard key={p.id}
        title={<Link className="underline underline-offset-4" to={`/purchases/${p.id}`}>{p.orderNumber}</Link>}>
        <RecordFields fields={[
          { label: 'Created (UTC)', value: p.createdAt.slice(0, 10) },
          { label: 'Status', value: p.status },
          ...(p.grandTotal !== undefined ? [{ label: 'Total', value: formatMoney(p.grandTotal) }] : []),
        ]} />
      </RecordCard>)}</div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={query.isFetching || page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <span className="text-sm" aria-live="polite">Page {page}</span>
        <Button variant="secondary" disabled={query.isFetching || page * 50 >= query.data.totalCount} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </>}
  </div>;
}
