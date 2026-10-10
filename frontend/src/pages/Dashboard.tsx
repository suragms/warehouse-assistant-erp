import { useAuthStore } from '../stores/authStore';
import { hasPermission } from '../auth/hasPermission';
import { formatMoney } from '../lib/formatMoney';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../api/dashboardApi';
import { dashboardKeys } from '../lib/queryKeys';
import { PageHeader } from '../components/ui';
import {
  ShoppingBag,
  Package,
  AlertTriangle,
  DollarSign,
  Clock,
  Activity,
  Bell,
  AlertCircle,
  RefreshCw,
  ArrowRight
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const canPurchase = hasPermission(user, 'purchase.view'), canStock = hasPermission(user, 'stock.view');
  const canCreate = hasPermission(user, 'purchase.create'), canFinance = ['Owner', 'Admin', 'SuperAdmin'].includes(user?.currentBusiness?.role ?? '');

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: dashboardApi.getDashboard,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Overview of your business operations and inventory" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 animate-pulse h-28 flex flex-col justify-between">
              <div className="h-3 bg-slate-200 rounded w-1/2"></div>
              <div className="h-7 bg-slate-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-64 animate-pulse"></div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-64 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Overview of your business operations and inventory" />
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-12 text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Dashboard data could not be loaded</h3>
          <p className="text-sm text-slate-500 max-w-md">
            We encountered an error while fetching your dashboard metrics. Please check your network connection or try again.
          </p>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-[#0E4F46] hover:bg-[#0E4F46]/90 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data?.purchaseMetrics || !data?.stockMetrics) return <div><PageHeader title="Dashboard" /><p role="alert">Dashboard data is unavailable. <button onClick={() => void refetch()}>Retry</button></p></div>;
  const pMetrics = data.purchaseMetrics;
  const sMetrics = data.stockMetrics;

  const alerts = data?.operationalAlerts || [];
  const recentPurchases = data?.recentPurchases || [];
  const recentStockActivity = data?.recentStockActivity || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader title="Dashboard" subtitle="Overview of your business operations, inventory, and purchases" />
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm"
            title="Refresh Dashboard"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canCreate && <button
            onClick={() => navigate('/purchases/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0E4F46] hover:bg-[#0E4F46]/90 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
          >
            <ShoppingBag className="w-4 h-4" /> New Purchase
          </button>}
        </div>
      </div>

      {/* Operational Alerts banner if any */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
            <Bell className="w-4 h-4 text-amber-600" />
            Operational Alerts ({alerts.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {alerts.slice(0, 4).map((alert, idx) => (
              <div key={idx} className="bg-white/80 border border-amber-200/60 rounded-lg p-3 text-xs flex flex-col gap-1">
                <span className="font-semibold text-slate-900">{alert.title}</span>
                <span className="text-slate-600">{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Spend */}
        {canPurchase && canFinance && <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Purchase Spend</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {formatMoney(pMetrics.totalPurchaseSpend)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{pMetrics.completedPurchasesCount} completed orders</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>}

        {/* Card 2: Today's / Active Purchases */}
        {canPurchase && <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Purchases</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{pMetrics.activePurchasesCount}</p>
            <p className="text-xs text-slate-400 mt-1">{pMetrics.todayPurchasesCount} created today ({pMetrics.pendingPurchasesCount} pending)</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <ShoppingBag className="w-6 h-6" />
          </div>
        </div>}

        {/* Card 3: Stock Health - Low Stock */}
        {canStock && <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Low Stock Items</p>
            <p className={`text-2xl font-bold mt-1 ${sMetrics.lowStockCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {sMetrics.lowStockCount}
            </p>
            <p className="text-xs text-slate-400 mt-1">Out of stock: {sMetrics.outOfStockCount}</p>
          </div>
          <div className={`p-3 rounded-xl ${sMetrics.lowStockCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>}

        {/* Card 4: Catalog & Inventory Items */}
        {canStock && <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Catalog Items</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{sMetrics.totalCatalogItems}</p>
            <p className="text-xs text-slate-400 mt-1">{sMetrics.itermsWithPhysicalVariance} variance flags</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
        </div>}

      </div>

      {/* Recent Purchases & Stock Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Purchases Table */}
        {canPurchase && <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#0E4F46]" />
              Recent Purchase Orders
            </h2>
            <button
              onClick={() => navigate('/purchases/list')}
              className="text-xs font-medium text-[#0E4F46] hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentPurchases.length === 0 ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center flex-1">
              <ShoppingBag className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-medium">No purchase orders found</p>
              <p className="text-xs text-slate-400 mt-1">Create your first purchase order to start tracking procurement.</p>
            </div>
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Status</th>
                    {canFinance && <th className="py-3 px-4 text-right">Total</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {recentPurchases.slice(0, 5).map((po) => (
                    <tr
                      key={po.id}
                      onClick={() => navigate(`/purchases/${po.id}`)}
                      className="hover:bg-slate-50/75 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">{po.orderNumber}</td>
                      <td className="py-3 px-4 text-slate-700 truncate max-w-[140px]">{po.supplierName}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />
                          {po.status === 0 ? 'Draft' : po.status === 1 ? 'Confirmed' : po.status === 2 ? 'Dispatched' : po.status === 3 ? 'Arrived' : po.status === 4 ? 'Verified' : po.status === 5 ? 'Completed' : 'Cancelled'}
                        </span>
                      </td>
                      {canFinance && <td className="py-3 px-4 text-right font-semibold text-slate-900">
                        {formatMoney(po.grandTotal)}
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>}

        {/* Recent Stock Activity */}
        {canStock && <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0E4F46]" />
              Recent Inventory Activity
            </h2>
            <button
              onClick={() => navigate('/inventory/all')}
              className="text-xs font-medium text-[#0E4F46] hover:underline flex items-center gap-1"
            >
              View inventory <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentStockActivity.length === 0 ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center flex-1">
              <Package className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-medium">No stock activity recorded</p>
              <p className="text-xs text-slate-400 mt-1">Inventory movements, receipts, and adjustments will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Item</th>
                    <th className="py-3 px-4">Movement</th>
                    <th className="py-3 px-4">Qty</th>
                    <th className="py-3 px-4 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {recentStockActivity.slice(0, 5).map((act) => (
                    <tr key={act.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{act.catalogItemName}</p>
                        <p className="text-xs text-slate-400">{act.itemCode}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          act.quantityDelta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {act.movementType}
                        </span>
                      </td>
                      <td className={`py-3 px-4 font-bold text-xs ${act.quantityDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {act.quantityDelta > 0 ? `+${act.quantityDelta}` : act.quantityDelta}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-500">
                        {new Date(act.date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>}

      </div>
    </div>
  );
}
