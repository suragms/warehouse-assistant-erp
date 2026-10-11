import { hasPermission } from '../../auth/hasPermission';
import { ErrorState } from '../../components/ui';
import { DataTableScroll, RecordCard, RecordFields, ResponsiveRecords } from '../../components/ui/ResponsiveRecords';
import { purchaseErrorMessage } from '../../lib/purchaseValidation';
import { useAuthStore } from '../../stores/authStore';
import { purchaseSelectionCsv } from '../../api/exportsApi';
import { formatMoney } from '../../lib/formatMoney';
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { purchaseApi, PurchaseStatus, DeliveryState, type PurchaseOrderDto } from '../../api/purchaseApi';
import { supplierApi } from '../../api/supplierApi';
import { purchaseKeys, supplierKeys, dashboardKeys, reportKeys } from '../../lib/queryKeys';
import {
  ShoppingBag,
  Plus,
  Search,
  Eye,
  Trash2,
  CheckCircle,
  Truck,
  PackageCheck
} from 'lucide-react';

const statusLabels: Record<PurchaseStatus, { label: string; color: string }> = {
  [PurchaseStatus.Draft]: { label: 'Draft', color: 'bg-slate-100 text-slate-700' },
  [PurchaseStatus.Confirmed]: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700' },
  [PurchaseStatus.Dispatched]: { label: 'Dispatched', color: 'bg-amber-100 text-amber-700' },
  [PurchaseStatus.Arrived]: { label: 'Arrived', color: 'bg-indigo-100 text-indigo-700' },
  [PurchaseStatus.Verified]: { label: 'Verified', color: 'bg-purple-100 text-purple-700' },
  [PurchaseStatus.Completed]: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
  [PurchaseStatus.Cancelled]: { label: 'Cancelled', color: 'bg-rose-100 text-rose-700' },
};

export default function PurchaseList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<PurchaseStatus | undefined>(undefined);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const user = useAuthStore(s => s.user);
  const role = user?.currentBusiness?.role;
  const can = (permission: string) => hasPermission(user, permission);
  const financialOwner = role === 'Owner' || role === 'Admin' || role === 'SuperAdmin';
  const [selected, setSelected] = useState<Set<string>>(new Set()), [copying, setCopying] = useState(false), [copyNotice, setCopyNotice] = useState(''), [copyError, setCopyError] = useState('');
  const selectionScope = useRef(0);

  const { data: suppliersData } = useQuery({
    queryKey: supplierKeys.list(),
    queryFn: () => supplierApi.getSuppliers(1, 100),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: purchaseKeys.list({ page, search, status: selectedStatus, supplierId: selectedSupplier }),
    queryFn: () => purchaseApi.getPurchases(page, 20, search || undefined, selectedStatus, selectedSupplier || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchaseApi.deletePurchase(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: reportKeys.all });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, version }: { id: string; status: PurchaseStatus; version: number }) => purchaseApi.updateStatus(id, status, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: reportKeys.all });
    },
  });

  const handleDelete = async (id: string, status: PurchaseStatus) => {
    if (status !== PurchaseStatus.Draft && status !== PurchaseStatus.Cancelled) {
      alert('Only Draft or Cancelled purchase orders can be deleted.');
      return;
    }
    if (confirm('Are you sure you want to delete this purchase order?')) {
      deleteMutation.mutate(id);
    }
  };

  const orderActions = (po: PurchaseOrderDto) => <div className="flex flex-wrap items-center gap-2">
    <button
      onClick={() => navigate(`/purchases/${po.id}`)}
      aria-label={`View ${po.orderNumber}`} title="View Details"
      className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-block"
    >
      <Eye className="w-4 h-4" />
    </button>
    {po.status === PurchaseStatus.Draft && can('purchase.edit') && (
      <button
        disabled={statusMutation.isPending}
        onClick={() => statusMutation.mutate({ id: po.id, status: PurchaseStatus.Confirmed, version: po.version })}
        aria-label={`Confirm ${po.orderNumber}`} title="Confirm Order"
        className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-block"
      >
        <CheckCircle className="w-4 h-4" />
      </button>
    )}
    {po.status === PurchaseStatus.Confirmed && can('purchase.delivery') && (
      <button
        disabled={statusMutation.isPending}
        onClick={() => statusMutation.mutate({ id: po.id, status: PurchaseStatus.Dispatched, version: po.version })}
        aria-label={`Dispatch ${po.orderNumber}`} title="Mark Dispatched"
        className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors inline-block"
      >
        <Truck className="w-4 h-4" />
      </button>
    )}
    {(po.status === PurchaseStatus.Dispatched || po.status === PurchaseStatus.Arrived) && can('purchase.verify') && can('purchase.commit') && (
      <button
        onClick={() => navigate(`/purchases/${po.id}`)}
        aria-label={`Receive items for ${po.orderNumber}`} title="Receive Items"
        className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors inline-block"
      >
        <PackageCheck className="w-4 h-4" />
      </button>
    )}
    {(po.status === PurchaseStatus.Draft || po.status === PurchaseStatus.Cancelled) && can('purchase.delete') && (
      <button
        onClick={() => handleDelete(po.id, po.status)}
        disabled={deleteMutation.isPending} aria-label={`Delete ${po.orderNumber}`} title="Delete Order"
        className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-block"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    )}
  </div>;

  const toggleSelection = (id: string, checked: boolean) => setSelected(current => {
    const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next;
  });
  const selectPage = (checked: boolean) => setSelected(checked ? new Set(data?.data.map(row => row.id)) : new Set());
  const clearSelection = () => {
    selectionScope.current += 1;
    setSelected(new Set()); setCopyNotice(''); setCopyError('');
  };
  const selectedRows = (data?.data ?? []).filter(row => selected.has(row.id));

  return (
    <div className="space-y-6">
      {copyNotice && <p role="status" className="text-emerald-800">{copyNotice}</p>}{copyError && <p role="alert" className="text-red-700">{copyError}</p>}
      {financialOwner && <button className="rounded bg-emerald-800 text-white px-4 py-3 disabled:opacity-50" disabled={copying || isLoading || !selectedRows.length} onClick={async () => {
        if (copying || !selectedRows.length) return;
        const scope = selectionScope.current;
        setCopying(true); setCopyNotice(''); setCopyError('');
        try { const csv = purchaseSelectionCsv(selectedRows); await navigator.clipboard.writeText(csv); if (scope === selectionScope.current) setCopyNotice('Selected purchases copied as CSV.'); }
        catch { if (scope === selectionScope.current) setCopyError('Selected purchases could not be copied. Refresh the list and try again.'); } finally { setCopying(false); }
      }}>Copy selected CSV</button>}
      {(statusMutation.error || deleteMutation.error) && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{purchaseErrorMessage(statusMutation.error || deleteMutation.error)}</p>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 shrink-0 text-indigo-600" />
            Purchase Orders
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage purchase lifecycle, supplier ordering, and incoming inventory receipts.
          </p>
        </div>
        {can('purchase.create') && <button
          onClick={() => navigate('/purchases/new')}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Purchase Order
        </button>}
      </div>

      {/* Filters bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-0 w-full sm:min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              aria-label="Search purchase orders" type="text"
              placeholder="Search by order # or supplier..."
              value={search}
              onChange={(e) => { clearSelection(); setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            aria-label="Filter purchase status" value={selectedStatus !== undefined ? selectedStatus.toString() : ''}
            onChange={(e) => { clearSelection(); setSelectedStatus(e.target.value !== '' ? Number(e.target.value) as PurchaseStatus : undefined); setPage(1); }}
            className="w-full min-w-0 sm:w-auto sm:max-w-72 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            {Object.entries(statusLabels).map(([val, { label }]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          <select
            aria-label="Filter supplier" value={selectedSupplier}
            onChange={(e) => { clearSelection(); setSelectedSupplier(e.target.value); setPage(1); }}
            className="w-full min-w-0 sm:w-auto sm:max-w-72 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Suppliers</option>
            {suppliersData?.data?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table / Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading purchase orders...</div>
        ) : error ? (
          <ErrorState message="Purchase orders could not be loaded." onRetry={() => void refetch()} />
        ) : data?.data?.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ShoppingBag className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium">No purchase orders found</p>
            <p className="text-sm text-slate-400 mt-1">Get started by creating a new purchase order.</p>
          </div>
        ) : (
          <ResponsiveRecords label="Purchase orders" mobile={
            <div className="space-y-3 p-3">
              {financialOwner && <label className="flex items-center gap-3 min-h-11 px-1 text-sm font-medium text-slate-700">
                <input type="checkbox" aria-label="Select all purchases on this page" checked={!!data?.data.length && data.data.every(row => selected.has(row.id))} onChange={e => selectPage(e.target.checked)} />
                Select all purchases on this page
              </label>}
              {data?.data?.map(po => <RecordCard key={po.id} title={
                <button className="text-left font-semibold text-indigo-700" onClick={() => navigate(`/purchases/${po.id}`)}>{po.orderNumber}</button>
              } subtitle={po.supplierName} actions={orderActions(po)}>
                {financialOwner && <label className="mb-3 flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" aria-label={'Select ' + po.orderNumber} checked={selected.has(po.id)} onChange={e => toggleSelection(po.id, e.target.checked)} />Select purchase
                </label>}
                <RecordFields fields={[
                  { label: 'Status', value: <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusLabels[po.status]?.color ?? 'bg-slate-100 text-slate-700'}`}>{statusLabels[po.status]?.label ?? 'Unknown'}</span> },
                  { label: 'Delivery', value: po.deliveryState === DeliveryState.Delivered ? 'Delivered' : po.deliveryState === DeliveryState.Partial ? 'Partial' : 'Pending' },
                  { label: 'Grand total', value: <span className="font-semibold">{formatMoney(po.grandTotal)}</span> },
                  { label: 'Created', value: new Date(po.createdAt).toLocaleDateString() },
                ]} />
              </RecordCard>)}
            </div>
          }>
          <DataTableScroll label="Purchase orders comparison" minWidth="64rem">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  {financialOwner && <th className="py-3 px-4"><input type="checkbox" aria-label="Select all purchases on this page" checked={!!data?.data.length && data.data.every(row => selected.has(row.id))} onChange={e => selectPage(e.target.checked)} /></th>}
                  <th className="py-3 px-4 whitespace-nowrap">Order #</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Delivery</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">Grand Total</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {data?.data?.map((po) => {
                  const statusInfo = statusLabels[po.status] || { label: 'Unknown', color: 'bg-slate-100 text-slate-700' };
                  return (
                    <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                      {financialOwner && <td className="py-3 px-4"><input type="checkbox" aria-label={'Select ' + po.orderNumber} checked={selected.has(po.id)} onChange={e => toggleSelection(po.id, e.target.checked)} /></td>}
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">
                        <button
                          onClick={() => navigate(`/purchases/${po.id}`)}
                          className="hover:text-indigo-600 transition-colors font-semibold"
                        >
                          {po.orderNumber}
                        </button>
                      </td>
                      <td className="py-3 px-4 min-w-52 max-w-80 break-words text-slate-700">{po.supplierName}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs font-medium">
                        {po.deliveryState === DeliveryState.Delivered ? (
                          <span className="text-emerald-600 flex items-center gap-1"><PackageCheck className="w-3.5 h-3.5" /> Delivered</span>
                        ) : po.deliveryState === DeliveryState.Partial ? (
                          <span className="text-amber-600 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Partial</span>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-semibold text-slate-900">
                        {formatMoney(po.grandTotal)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 text-xs">
                        {new Date(po.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 min-w-40 text-right">
                        {orderActions(po)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTableScroll>
          </ResponsiveRecords>
        )}

        {/* Pagination */}
        {data?.meta && data.meta.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex flex-wrap gap-3 items-center justify-between text-sm text-slate-500">
            <span>
              Page {data.meta.page} of {data.meta.totalPages} ({data.meta.totalCount} total orders)
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={page <= 1}
                onClick={() => { clearSelection(); setPage(p => Math.max(1, p - 1)); }}
                className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                disabled={page >= data.meta.totalPages}
                onClick={() => { clearSelection(); setPage(p => p + 1); }}
                className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
