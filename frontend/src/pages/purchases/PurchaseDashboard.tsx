import { dashboardApi } from '../../api/dashboardApi';
import { dashboardKeys } from '../../lib/queryKeys';
import { ErrorState } from '../../components/ui';
import { DataTableScroll, RecordCard, RecordFields, ResponsiveRecords } from '../../components/ui/ResponsiveRecords';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../auth/hasPermission';
import { formatMoney } from '../../lib/formatMoney';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PurchaseStatus, DeliveryState } from '../../api/purchaseApi';
import {
  ShoppingBag,
  Plus,
  Clock,
  Truck,
  CheckCircle,
  DollarSign
} from 'lucide-react';

export default function PurchaseDashboard() {
  const navigate = useNavigate();

  const user = useAuthStore(state => state.user);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: dashboardKeys.summary(), queryFn: dashboardApi.getDashboard });
  const draftCount = data?.deliveryMetrics?.draftPurchases;
  const confirmedCount = data?.deliveryMetrics?.confirmedPurchases;
  const dispatchedCount = data?.deliveryMetrics ? data.deliveryMetrics.dispatchedPurchases + data.deliveryMetrics.arrivedPurchases : undefined;
  const totalSpend = data?.purchaseMetrics?.totalPurchaseSpend;
  const recentOrders = data?.recentPurchases ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 shrink-0 text-indigo-600" />
            Purchase Engine Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of purchase orders, lifecycle progress, shipments, and inventory receipts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate('/purchases/list')}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
          >
            View All Orders
          </button>
          {hasPermission(user, 'purchase.create') && <button
            onClick={() => navigate('/purchases/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> New Purchase Order
          </button>}
        </div>
      </div>

      {error && <ErrorState message="Purchase overview could not be loaded." onRetry={() => void refetch()} />}
      {!error && <>
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white min-w-0 p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Draft Orders</p>
            <p className="text-2xl break-words font-bold text-slate-900 mt-1">{draftCount ?? 'Unavailable'}</p>
          </div>
          <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white min-w-0 p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confirmed</p>
            <p className="text-2xl break-words font-bold text-blue-600 mt-1">{confirmedCount ?? 'Unavailable'}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white min-w-0 p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">In Transit / Dispatched</p>
            <p className="text-2xl break-words font-bold text-amber-600 mt-1">{dispatchedCount ?? 'Unavailable'}</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white min-w-0 p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reporting Purchase Spend</p>
            <p className="text-2xl break-words font-bold text-emerald-600 mt-1">{totalSpend == null ? 'Unavailable with your access' : formatMoney(totalSpend)}</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent Purchase Orders</h2>
          <button
            onClick={() => navigate('/purchases/list')}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all →
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading recent purchases...</div>
        ) : recentOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ShoppingBag className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium">No purchase orders found</p>
          </div>
        ) : (
          <ResponsiveRecords label="Recent purchase orders" mobile={
            <div className="p-3 space-y-3">
              {recentOrders.map(po => <RecordCard key={po.id} title={po.orderNumber} subtitle={po.supplierName} actions={
                <button aria-label={`Inspect ${po.orderNumber}`} onClick={() => navigate(`/purchases/${po.id}`)} className="inline-flex items-center min-h-11 px-3 py-2 rounded-lg border border-indigo-200 text-sm font-medium text-indigo-700">Inspect</button>
              }>
                <RecordFields fields={[
                  { label: 'Status', value: Object.keys(PurchaseStatus).find(key => PurchaseStatus[key as keyof typeof PurchaseStatus] === po.status) ?? 'Unknown' },
                  { label: 'Delivery', value: Object.keys(DeliveryState).find(key => DeliveryState[key as keyof typeof DeliveryState] === po.deliveryState) ?? 'Unknown' },
                  { label: 'Grand total', value: formatMoney(po.grandTotal) },
                ]} />
              </RecordCard>)}
            </div>
          }>
          <DataTableScroll label="Recent purchase orders comparison" minWidth="52rem">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4 whitespace-nowrap">Order #</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Delivery</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">Grand Total</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {recentOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap font-semibold text-slate-900">{po.orderNumber}</td>
                    <td className="py-3 px-4 min-w-52 max-w-80 break-words text-slate-700">{po.supplierName}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {Object.keys(PurchaseStatus).find(key => PurchaseStatus[key as keyof typeof PurchaseStatus] === po.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-600">
                      {Object.keys(DeliveryState).find(key => DeliveryState[key as keyof typeof DeliveryState] === po.deliveryState)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-semibold text-slate-900">
                      {formatMoney(po.grandTotal)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => navigate(`/purchases/${po.id}`)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableScroll>
          </ResponsiveRecords>
        )}
      </div>
      </>}
    </div>
  );
}
