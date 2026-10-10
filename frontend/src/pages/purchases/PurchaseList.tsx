import { purchaseErrorMessage } from '../../lib/purchaseValidation';
import { useAuthStore } from '../../stores/authStore';
import { purchaseSelectionCsv } from '../../api/exportsApi';
import { formatMoney } from '../../lib/formatMoney';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { purchaseApi, PurchaseStatus, DeliveryState } from '../../api/purchaseApi';
import { supplierApi } from '../../api/supplierApi';
import { purchaseKeys, supplierKeys } from '../../lib/queryKeys';
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
  const role = useAuthStore(s => s.user?.currentBusiness?.role);
  const financialOwner = role === 'Owner' || role === 'Admin' || role === 'SuperAdmin';
  const [selected, setSelected] = useState<Set<string>>(new Set()), [copying, setCopying] = useState(false), [copyNotice, setCopyNotice] = useState(''), [copyError, setCopyError] = useState('');

  const { data: suppliersData } = useQuery({
    queryKey: supplierKeys.list(),
    queryFn: () => supplierApi.getSuppliers(1, 100),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: purchaseKeys.list({ page, search, status: selectedStatus, supplierId: selectedSupplier }),
    queryFn: () => purchaseApi.getPurchases(page, 20, search || undefined, selectedStatus, selectedSupplier || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchaseApi.deletePurchase(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, version }: { id: string; status: PurchaseStatus; version: number }) => purchaseApi.updateStatus(id, status, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
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

  return (
    <div className="space-y-6">
      {copyNotice && <p role="status" className="text-emerald-800">{copyNotice}</p>}{copyError && <p role="alert" className="text-red-700">{copyError}</p>}
      {financialOwner && <button className="rounded bg-emerald-800 text-white px-4 py-3 disabled:opacity-50" disabled={copying || isLoading || !selected.size} onClick={async () => {
        setCopying(true); setCopyNotice(''); setCopyError('');
        try { const csv = purchaseSelectionCsv((data?.data ?? []).filter(row => selected.has(row.id))); await navigator.clipboard.writeText(csv); setCopyNotice('Selected purchases copied as CSV.'); }
        catch { setCopyError('Selected purchases could not be copied. Refresh the list and try again.'); } finally { setCopying(false); }
      }}>Copy selected CSV</button>}
      {(statusMutation.error || deleteMutation.error) && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{purchaseErrorMessage(statusMutation.error || deleteMutation.error)}</p>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-indigo-600" />
            Purchase Orders
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage purchase lifecycle, supplier ordering, and incoming inventory receipts.
          </p>
        </div>
        <button
          onClick={() => navigate('/purchases/new')}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Purchase Order
        </button>
      </div>

      {/* Filters bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by order # or supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={selectedStatus !== undefined ? selectedStatus.toString() : ''}
            onChange={(e) => setSelectedStatus(e.target.value !== '' ? Number(e.target.value) as PurchaseStatus : undefined)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            {Object.entries(statusLabels).map(([val, { label }]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <div className="p-8 text-center text-rose-500">Failed to load purchase orders.</div>
        ) : data?.data?.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ShoppingBag className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium">No purchase orders found</p>
            <p className="text-sm text-slate-400 mt-1">Get started by creating a new purchase order.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  {financialOwner && <th className="py-3 px-4"><input type="checkbox" aria-label="Select all purchases on this page" checked={!!data?.data.length && data.data.every(row => selected.has(row.id))} onChange={e => setSelected(e.target.checked ? new Set(data?.data.map(row => row.id)) : new Set())} /></th>}
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Delivery</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {data?.data?.map((po) => {
                  const statusInfo = statusLabels[po.status] || { label: 'Unknown', color: 'bg-slate-100 text-slate-700' };
                  return (
                    <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                      {financialOwner && <td className="py-3 px-4"><input type="checkbox" aria-label={'Select ' + po.orderNumber} checked={selected.has(po.id)} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(po.id); else next.delete(po.id); return next; })} /></td>}
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <button
                          onClick={() => navigate(`/purchases/${po.id}`)}
                          className="hover:text-indigo-600 transition-colors font-semibold"
                        >
                          {po.orderNumber}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{po.supplierName}</td>
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
                      <td className="py-3 px-4 text-right font-semibold text-slate-900">
                        {formatMoney(po.grandTotal)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-xs">
                        {new Date(po.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => navigate(`/purchases/${po.id}`)}
                          title="View Details"
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-block"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {po.status === PurchaseStatus.Draft && (
                          <button
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: po.id, status: PurchaseStatus.Confirmed, version: po.version })}
                            title="Confirm Order"
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-block"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {po.status === PurchaseStatus.Confirmed && (
                          <button
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: po.id, status: PurchaseStatus.Dispatched, version: po.version })}
                            title="Mark Dispatched"
                            className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors inline-block"
                          >
                            <Truck className="w-4 h-4" />
                          </button>
                        )}
                        {(po.status === PurchaseStatus.Dispatched || po.status === PurchaseStatus.Arrived) && (
                          <button
                            onClick={() => navigate(`/purchases/${po.id}`)}
                            title="Receive Items"
                            className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors inline-block"
                          >
                            <PackageCheck className="w-4 h-4" />
                          </button>
                        )}
                        {(po.status === PurchaseStatus.Draft || po.status === PurchaseStatus.Cancelled) && (
                          <button
                            onClick={() => handleDelete(po.id, po.status)}
                            title="Delete Order"
                            className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-block"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data?.meta && data.meta.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {data.meta.page} of {data.meta.totalPages} ({data.meta.totalCount} total orders)
            </span>
            <div className="space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage(p => p + 1)}
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
