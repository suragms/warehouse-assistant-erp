import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/apiClient';
import { supplierKeys, brokerKeys } from '../lib/queryKeys';
import { PageHeader, Card, ErrorState, Skeleton } from '../components/ui';
import { SupplierHistory } from '../components/SupplierHistory';
import { useAuthStore } from '../stores/authStore';
import { hasPermission } from '../auth/hasPermission';
import type { Supplier, Broker } from '../api/catalogApi';
export default function PartnerDetail({ kind }: { kind: 'supplier' | 'broker' }) {
  const { id } = useParams(), user = useAuthStore(s => s.user), plural = kind === 'supplier' ? 'suppliers' : 'brokers';
  const query = useQuery({ queryKey: kind === 'supplier' ? supplierKeys.detail(id!) : brokerKeys.detail(id!), queryFn: async () => (await apiClient.get<Supplier & Broker>(`/catalog/${plural}/${id}`)).data, enabled: !!id });
  return <div className="space-y-5 min-w-0"><Link className="inline-block py-2 underline" to={`/${plural}`}>Back to {plural}</Link>
    {query.isPending ? <><PageHeader title={`Loading ${kind}`} /><Skeleton className="h-40" /></> : query.isError || !query.data ? <><PageHeader title={`${kind === 'supplier' ? 'Supplier' : 'Broker'} details`} /><ErrorState message={`${kind === 'supplier' ? 'Supplier' : 'Broker'} could not be loaded. It may be unavailable or you may not have access.`} onRetry={() => void query.refetch()} /></> : <>
      <PageHeader title={query.data.name} subtitle={`${kind === 'supplier' ? 'Supplier' : 'Broker'} · ${query.data.isActive ? 'Active' : 'Inactive'}`} />
      <Card className="p-5"><dl className="grid sm:grid-cols-2 gap-4">{kind === 'supplier' && <><div className="min-w-0 break-words"><dt>Phone</dt><dd>{query.data.phone || 'Not recorded'}</dd></div><div className="min-w-0 break-words"><dt>Address</dt><dd>{query.data.address || 'Not recorded'}</dd></div></>}{kind === 'supplier' ? <div className="min-w-0 break-words"><dt>Notes</dt><dd>{query.data.notes || 'No notes recorded'}</dd></div> : <div className="min-w-0 break-words"><dt>Linked suppliers</dt><dd>{query.data.linkedSuppliersCount}</dd></div>}</dl></Card>
      {kind === 'supplier' && hasPermission(user, 'purchase.view') && <Card className="p-5"><h2 className="text-lg font-semibold mb-3">Purchase history</h2><SupplierHistory id={id!} /></Card>}
    </>}
  </div>;
}
