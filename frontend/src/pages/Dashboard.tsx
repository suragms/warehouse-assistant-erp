import { useAuthStore } from '../stores/authStore';
import { hasPermission } from '../auth/hasPermission';
import { formatMoney } from '../lib/formatMoney';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ResponsiveRecords, RecordCard, RecordFields, DataTableScroll } from '../components/ui/ResponsiveRecords';
import { dashboardApi, type DashboardMetricsDto } from '../api/dashboardApi';
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
  ArrowRight,
  CheckCircle2,
  Truck,
  PackageX,
} from 'lucide-react';

const NOTIFICATION_TYPE_MAP: Record<number, string> = {
  0: 'system',
  1: 'lowstock',
  2: 'outofstock',
  3: 'stockvariance',
  4: 'purchasepending',
  5: 'verificationrequired',
  6: 'paymentpending',
  7: 'deliverypending',
};

function normalizeAlertType(type: unknown): string {
  if (typeof type === 'number') {
    return NOTIFICATION_TYPE_MAP[type] ?? String(type);
  }
  return String(type ?? '').toLowerCase();
}

function getAlertSeverity(alert: DashboardMetricsDto['operationalAlerts'][number]): 'critical' | 'warning' | 'info' {
  const typeLower = normalizeAlertType(alert.type);
  const titleLower = String(alert.title ?? '').toLowerCase();
  if (typeLower.includes('critical') || typeLower.includes('outofstock') || titleLower.includes('critical') || titleLower.includes('out of stock')) {
    return 'critical';
  }
  if (typeLower.includes('lowstock') || typeLower.includes('warning') || titleLower.includes('warning') || titleLower.includes('low stock')) {
    return 'warning';
  }
  return 'info';
}

function getAlertRoute(alert: DashboardMetricsDto['operationalAlerts'][number]): string {
  if (alert.referenceId) {
    const id = encodeURIComponent(String(alert.referenceId));
    if (alert.referenceType === 'Purchase' || alert.referenceType === 'PurchaseOrder') return `/purchases/${id}`;
    if (alert.referenceType === 'CatalogItem') return `/inventory/${id}`;
  }
  const typeLower = normalizeAlertType(alert.type);
  const titleLower = String(alert.title ?? '').toLowerCase();
  if (typeLower.includes('outofstock') || titleLower.includes('out of stock')) {
    return '/inventory/out-of-stock';
  }
  if (typeLower.includes('lowstock') || titleLower.includes('low stock')) {
    return '/inventory/low-stock';
  }
  if (typeLower.includes('verification') || typeLower.includes('arrived') || titleLower.includes('verification') || titleLower.includes('receiving')) {
    return '/purchases/list';
  }
  return '/inventory/all';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const canPurchase = hasPermission(user, 'purchase.view');
  const canStock = hasPermission(user, 'stock.view');
  const canCreate = hasPermission(user, 'purchase.create');
  const canFinance = ['Owner', 'Admin', 'SuperAdmin'].includes(user?.currentBusiness?.role ?? '');

  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt } = useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: dashboardApi.getDashboard,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 pb-12 sm:pb-6 min-w-0">
        <PageHeader title="Dashboard" subtitle="Overview of your business operations, inventory, and purchases" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white p-4 sm:p-5 rounded-xl shadow-xs border border-slate-200 animate-pulse h-28 flex flex-col justify-between">
              <div className="h-3 bg-slate-200 rounded w-1/2"></div>
              <div className="h-7 bg-slate-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
          <div className="bg-white p-6 rounded-xl shadow-xs border border-slate-200 h-64 animate-pulse"></div>
          <div className="bg-white p-6 rounded-xl shadow-xs border border-slate-200 h-64 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pb-12 sm:pb-6 min-w-0">
        <PageHeader title="Dashboard" subtitle="Overview of your business operations and inventory" />
        <div className="bg-white rounded-xl shadow-xs border border-red-200 p-8 sm:p-12 text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Dashboard data could not be loaded</h3>
          <p className="text-sm text-slate-500 max-w-md">
            We encountered an error while fetching your dashboard metrics. Please check your network connection or try again.
          </p>
          <button
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-[#0E4F46] hover:bg-[#0A3D36] text-white font-medium rounded-lg text-sm transition-colors shadow-xs min-h-11"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data?.purchaseMetrics || !data?.stockMetrics) {
    return (
      <div className="space-y-6 pb-12 sm:pb-6 min-w-0">
        <PageHeader title="Dashboard" />
        <p role="alert" className="text-sm text-slate-600">
          Dashboard data is unavailable.{' '}
          <button onClick={() => void refetch()} className="font-semibold text-teal-700 underline">
            Retry
          </button>
        </p>
      </div>
    );
  }

  const pMetrics = data.purchaseMetrics;
  const sMetrics = data.stockMetrics;
  const delivery = data?.deliveryMetrics;

  const alerts = data?.operationalAlerts || [];
  const recentPurchases = data?.recentPurchases || [];
  const recentStockActivity = data?.recentStockActivity || [];
  const purchaseStatus = (status: number | string) => {
    if (typeof status === 'number') {
      return ['Draft', 'Confirmed', 'Dispatched', 'Arrived', 'Verified', 'Completed', 'Cancelled'][status] ?? 'Unknown';
    }
    return status || 'Unknown';
  };

  const businessName = user?.currentBusiness?.businessName;
  const headerSubtitle = businessName
    ? `${businessName} · Operations, inventory, and procurement`
    : 'Overview of your business operations, inventory, and purchases';

  const lastUpdatedTime = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // Delivery breakdown if present
  const totalDeliveryCount = delivery
    ? (delivery.draftPurchases || 0) +
      (delivery.confirmedPurchases || 0) +
      (delivery.dispatchedPurchases || 0) +
      (delivery.arrivedPurchases || 0) +
      (delivery.verificationPending || 0)
    : 0;

  // Stock health breakdown
  const healthyStockCount = Math.max(0, sMetrics.totalCatalogItems - sMetrics.lowStockCount - sMetrics.outOfStockCount);
  const totalStockCount = Math.max(1, sMetrics.totalCatalogItems);
  const healthyPct = Math.round((healthyStockCount / totalStockCount) * 100);
  const lowPct = Math.round((sMetrics.lowStockCount / totalStockCount) * 100);
  const outPct = Math.min(100 - healthyPct - lowPct, Math.round((sMetrics.outOfStockCount / totalStockCount) * 100));

  return (
    <div className="space-y-5 sm:space-y-6 pb-12 sm:pb-6 min-w-0">
      {/* Responsive Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight whitespace-nowrap">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">{headerSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          {lastUpdatedTime && (
            <span className="text-xs text-slate-400 font-medium hidden xl:inline-flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Updated {lastUpdatedTime}</span>
            </span>
          )}
          <button
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100 rounded-lg text-sm font-medium transition-colors shadow-xs min-h-10 disabled:opacity-70"
            title="Refresh Dashboard"
            aria-label="Refresh Dashboard"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>{isRefetching ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          {canCreate && (
            <button
              onClick={() => navigate('/purchases/new')}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-[#0E4F46] hover:bg-[#0A3D36] active:bg-[#082E29] text-white font-medium rounded-lg text-sm transition-colors shadow-xs min-h-10"
              aria-label="New Purchase"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>New Purchase</span>
            </button>
          )}
        </div>
      </div>

      {/* Operational Alerts Banner */}
      {alerts.length > 0 ? (
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3.5 sm:p-4 shadow-xs flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
              <Bell className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Operational Alerts</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200/80 text-amber-900">
                {alerts.length}
              </span>
            </div>
            <span className="text-xs text-amber-700 font-medium hidden sm:inline">Attention recommended</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {alerts.slice(0, 4).map((alert, idx) => {
              const severity = getAlertSeverity(alert);
              const target = getAlertRoute(alert);
              const isCrit = severity === 'critical';
              const isWarn = severity === 'warning';

              return (
                <Link
                  key={idx}
                  to={target}
                  className={`group rounded-lg p-3 text-xs flex items-center justify-between gap-3 border transition-all ${
                    isCrit
                      ? 'bg-red-50/80 border-red-200 hover:border-red-300 hover:bg-red-50'
                      : isWarn
                      ? 'bg-white/95 border-amber-200/90 hover:border-amber-300 hover:bg-white'
                      : 'bg-white/95 border-teal-200/80 hover:border-teal-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
                        isCrit
                          ? 'bg-red-100 text-red-700'
                          : isWarn
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-teal-100 text-teal-700'
                      }`}
                    >
                      {isCrit ? (
                        <PackageX className="w-3.5 h-3.5" />
                      ) : isWarn ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : (
                        <Truck className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-900 truncate">{alert.title}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isCrit
                              ? 'bg-red-200 text-red-800'
                              : isWarn
                              ? 'bg-amber-200 text-amber-800'
                              : 'bg-teal-200 text-teal-800'
                          }`}
                        >
                          {isCrit ? 'Critical' : isWarn ? 'Warning' : 'Action'}
                        </span>
                      </div>
                      <span className="text-slate-600 line-clamp-1 break-words">{alert.message}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-xl p-3 sm:p-3.5 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-950">Operations Running Smoothly</p>
              <p className="text-xs text-emerald-700 truncate">Inventory thresholds and purchase intakes are within normal range.</p>
            </div>
          </div>
          <span className="text-xs font-medium text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full shrink-0 hidden sm:inline">
            0 alerts
          </span>
        </div>
      )}

      {/* KPI Cards Grid: 2-col on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Total Spend */}
        {canPurchase && canFinance && (
          <div
            onClick={() => navigate('/reports')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/reports'); }}
            className="bg-white p-3 sm:p-5 rounded-xl shadow-xs border border-slate-200 min-w-0 flex flex-col justify-between hover:border-[#0E4F46]/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 leading-snug">
                Total Purchase Spend
              </p>
              <div className="p-1.5 sm:p-2.5 shrink-0 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100 transition-colors">
                <DollarSign className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-2 min-w-0">
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900 whitespace-nowrap tabular-nums">
                {formatMoney(pMetrics.totalPurchaseSpend)}
              </p>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                {pMetrics.completedPurchasesCount} completed orders
              </p>
            </div>
          </div>
        )}

        {/* Card 2: Active Purchases */}
        {canPurchase && (
          <div
            onClick={() => navigate('/purchases/list')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/purchases/list'); }}
            className="bg-white p-3 sm:p-5 rounded-xl shadow-xs border border-slate-200 min-w-0 flex flex-col justify-between hover:border-[#0E4F46]/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 leading-snug">
                Active Purchases
              </p>
              <div className="p-1.5 sm:p-2.5 shrink-0 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-100 transition-colors">
                <ShoppingBag className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-2 min-w-0">
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-indigo-600 whitespace-nowrap tabular-nums">
                {pMetrics.activePurchasesCount}
              </p>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                {pMetrics.todayPurchasesCount} today · {pMetrics.pendingPurchasesCount} pending
              </p>
            </div>
          </div>
        )}

        {/* Card 3: Stock Health - Low Stock */}
        {canStock && (
          <div
            onClick={() => navigate(sMetrics.lowStockCount > 0 ? '/inventory/low-stock' : '/inventory/all')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                navigate(sMetrics.lowStockCount > 0 ? '/inventory/low-stock' : '/inventory/all');
              }
            }}
            className="bg-white p-3 sm:p-5 rounded-xl shadow-xs border border-slate-200 min-w-0 flex flex-col justify-between hover:border-[#0E4F46]/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 leading-snug">
                Low Stock Items
              </p>
              <div
                className={`p-1.5 sm:p-2.5 shrink-0 rounded-lg transition-colors ${
                  sMetrics.lowStockCount > 0
                    ? 'bg-amber-50 text-amber-600 group-hover:bg-amber-100'
                    : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-2 min-w-0">
              <p
                className={`text-base sm:text-xl lg:text-2xl font-bold whitespace-nowrap tabular-nums ${
                  sMetrics.lowStockCount > 0 ? 'text-amber-600' : 'text-slate-900'
                }`}
              >
                {sMetrics.lowStockCount}
              </p>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                Out of stock: {sMetrics.outOfStockCount}
              </p>
            </div>
          </div>
        )}

        {/* Card 4: Catalog & Inventory Items */}
        {canStock && (
          <div
            onClick={() => navigate('/catalog/items')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/catalog/items'); }}
            className="bg-white p-3 sm:p-5 rounded-xl shadow-xs border border-slate-200 min-w-0 flex flex-col justify-between hover:border-[#0E4F46]/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 leading-snug">
                Catalog Items
              </p>
              <div className="p-1.5 sm:p-2.5 shrink-0 bg-teal-50 text-teal-700 rounded-lg group-hover:bg-teal-100 transition-colors">
                <Package className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-2 min-w-0">
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900 whitespace-nowrap tabular-nums">
                {sMetrics.totalCatalogItems}
              </p>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                {sMetrics.itermsWithPhysicalVariance} variance flags
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Operational Analytics: Delivery Pipeline & Stock Health */}
      {(canPurchase || canStock) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
          {/* Section A: Purchase Order Delivery Pipeline */}
          {canPurchase && delivery && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 sm:p-5 flex flex-col justify-between gap-4 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">Procurement Delivery Pipeline</h2>
                    <p className="text-xs text-slate-400">Order fulfillment lifecycle distribution</p>
                  </div>
                </div>
                <Link
                  to="/purchases/list"
                  className="text-xs font-medium text-[#0E4F46] hover:underline flex items-center gap-1 shrink-0"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Progress Distribution Bar */}
              {totalDeliveryCount > 0 ? (
                <div className="space-y-3">
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                    {delivery.draftPurchases > 0 && (
                      <div
                        style={{ width: `${(delivery.draftPurchases / totalDeliveryCount) * 100}%` }}
                        className="bg-slate-400"
                        title={`Draft: ${delivery.draftPurchases}`}
                      />
                    )}
                    {delivery.confirmedPurchases > 0 && (
                      <div
                        style={{ width: `${(delivery.confirmedPurchases / totalDeliveryCount) * 100}%` }}
                        className="bg-blue-500"
                        title={`Confirmed: ${delivery.confirmedPurchases}`}
                      />
                    )}
                    {delivery.dispatchedPurchases > 0 && (
                      <div
                        style={{ width: `${(delivery.dispatchedPurchases / totalDeliveryCount) * 100}%` }}
                        className="bg-indigo-500"
                        title={`Dispatched: ${delivery.dispatchedPurchases}`}
                      />
                    )}
                    {delivery.arrivedPurchases > 0 && (
                      <div
                        style={{ width: `${(delivery.arrivedPurchases / totalDeliveryCount) * 100}%` }}
                        className="bg-amber-500"
                        title={`Arrived: ${delivery.arrivedPurchases}`}
                      />
                    )}
                    {delivery.verificationPending > 0 && (
                      <div
                        style={{ width: `${(delivery.verificationPending / totalDeliveryCount) * 100}%` }}
                        className="bg-teal-600"
                        title={`Verified: ${delivery.verificationPending}`}
                      />
                    )}
                  </div>

                  {/* Stage Metrics Grid */}
                  <div className="grid grid-cols-5 gap-1.5 text-center pt-1">
                    <div className="bg-slate-50 rounded-lg p-2 flex flex-col items-center">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Draft</span>
                      <span className="text-sm font-bold text-slate-800 tabular-nums">{delivery.draftPurchases}</span>
                    </div>
                    <div className="bg-blue-50/70 rounded-lg p-2 flex flex-col items-center">
                      <span className="text-[10px] text-blue-700 uppercase font-semibold">Confirmed</span>
                      <span className="text-sm font-bold text-blue-800 tabular-nums">{delivery.confirmedPurchases}</span>
                    </div>
                    <div className="bg-indigo-50/70 rounded-lg p-2 flex flex-col items-center">
                      <span className="text-[10px] text-indigo-700 uppercase font-semibold">In Transit</span>
                      <span className="text-sm font-bold text-indigo-800 tabular-nums">{delivery.dispatchedPurchases}</span>
                    </div>
                    <div className="bg-amber-50/70 rounded-lg p-2 flex flex-col items-center">
                      <span className="text-[10px] text-amber-700 uppercase font-semibold">Arrived</span>
                      <span className="text-sm font-bold text-amber-800 tabular-nums">{delivery.arrivedPurchases}</span>
                    </div>
                    <div className="bg-teal-50/70 rounded-lg p-2 flex flex-col items-center">
                      <span className="text-[10px] text-teal-700 uppercase font-semibold">Verified</span>
                      <span className="text-sm font-bold text-teal-800 tabular-nums">{delivery.verificationPending}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 bg-slate-50/60 rounded-lg">
                  No active orders in delivery pipeline
                </div>
              )}
            </div>
          )}

          {/* Section B: Inventory Stock Status Breakdown */}
          {canStock && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 sm:p-5 flex flex-col justify-between gap-4 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">Inventory Stock Health</h2>
                    <p className="text-xs text-slate-400">Warehouse stock availability overview</p>
                  </div>
                </div>
                <Link
                  to="/inventory/all"
                  className="text-xs font-medium text-[#0E4F46] hover:underline flex items-center gap-1 shrink-0"
                >
                  View stock <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Stacked Gauge Bar */}
              <div className="space-y-3">
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                  {healthyStockCount > 0 && (
                    <div
                      style={{ width: `${healthyPct}%` }}
                      className="bg-emerald-600 transition-all"
                      title={`Healthy: ${healthyStockCount} (${healthyPct}%)`}
                    />
                  )}
                  {sMetrics.lowStockCount > 0 && (
                    <div
                      style={{ width: `${lowPct}%` }}
                      className="bg-amber-500 transition-all"
                      title={`Low Stock: ${sMetrics.lowStockCount} (${lowPct}%)`}
                    />
                  )}
                  {sMetrics.outOfStockCount > 0 && (
                    <div
                      style={{ width: `${outPct}%` }}
                      className="bg-rose-500 transition-all"
                      title={`Out of Stock: ${sMetrics.outOfStockCount} (${outPct}%)`}
                    />
                  )}
                </div>

                {/* Legend & Summary Chips */}
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <Link
                    to="/inventory/all"
                    className="bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/60 rounded-lg p-2 flex flex-col items-center transition-colors"
                  >
                    <span className="text-[10px] text-emerald-700 uppercase font-semibold">Healthy</span>
                    <span className="text-sm font-bold text-emerald-900 tabular-nums">
                      {healthyStockCount}{' '}
                      <span className="text-[11px] font-normal text-emerald-700">({healthyPct}%)</span>
                    </span>
                  </Link>
                  <Link
                    to="/inventory/low-stock"
                    className="bg-amber-50/70 hover:bg-amber-100/70 border border-amber-200/60 rounded-lg p-2 flex flex-col items-center transition-colors"
                  >
                    <span className="text-[10px] text-amber-700 uppercase font-semibold">Low Stock</span>
                    <span className="text-sm font-bold text-amber-900 tabular-nums">
                      {sMetrics.lowStockCount}{' '}
                      <span className="text-[11px] font-normal text-amber-700">({lowPct}%)</span>
                    </span>
                  </Link>
                  <Link
                    to="/inventory/out-of-stock"
                    className="bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200/60 rounded-lg p-2 flex flex-col items-center transition-colors"
                  >
                    <span className="text-[10px] text-rose-700 uppercase font-semibold">Out of Stock</span>
                    <span className="text-sm font-bold text-rose-900 tabular-nums">
                      {sMetrics.outOfStockCount}{' '}
                      <span className="text-[11px] font-normal text-rose-700">({outPct}%)</span>
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Purchases & Stock Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
        {/* Recent Purchases Table */}
        {canPurchase && (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden min-w-0 flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
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
              <ResponsiveRecords
                label="Recent purchase orders"
                mobile={recentPurchases.slice(0, 5).map(po => (
                  <RecordCard
                    key={po.id}
                    title={<Link to={`/purchases/${po.id}`} className="underline">{po.orderNumber}</Link>}
                    subtitle={po.supplierName}
                    actions={
                      <Link
                        className="inline-flex items-center gap-1 py-2 text-sm font-medium text-teal-700 underline"
                        to={`/purchases/${po.id}`}
                      >
                        View purchase <ArrowRight className="w-4 h-4" />
                      </Link>
                    }
                  >
                    <RecordFields
                      fields={[
                        { label: 'Status', value: purchaseStatus(po.status) },
                        ...(canFinance ? [{ label: 'Total', value: formatMoney(po.grandTotal) }] : []),
                      ]}
                    />
                  </RecordCard>
                ))}
              >
                <DataTableScroll label="Recent purchase orders table" minWidth="32rem" className="flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4 whitespace-nowrap">Order #</th>
                        <th className="py-3 px-4 whitespace-nowrap">Supplier</th>
                        <th className="py-3 px-4 whitespace-nowrap">Status</th>
                        {canFinance && <th className="py-3 px-4 whitespace-nowrap text-right">Total</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {recentPurchases.slice(0, 5).map((po) => (
                        <tr
                          key={po.id}
                          onClick={() => navigate(`/purchases/${po.id}`)}
                          className="hover:bg-slate-50/75 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                            <Link
                              to={`/purchases/${po.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="underline"
                            >
                              {po.orderNumber}
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-slate-700 min-w-[10rem]">{po.supplierName}</td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" />
                              {purchaseStatus(po.status)}
                            </span>
                          </td>
                          {canFinance && (
                            <td className="py-3 px-4 whitespace-nowrap text-right font-semibold text-slate-900">
                              {formatMoney(po.grandTotal)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTableScroll>
              </ResponsiveRecords>
            )}
          </div>
        )}

        {/* Recent Stock Activity */}
        {canStock && (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden min-w-0 flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
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
              <ResponsiveRecords
                label="Recent inventory activity"
                mobile={recentStockActivity.slice(0, 5).map((act) => (
                  <RecordCard key={act.id} title={act.catalogItemName} subtitle={act.itemCode}>
                    <RecordFields
                      fields={[
                        { label: 'Movement', value: act.movementType },
                        {
                          label: 'Quantity change',
                          value: (
                            <span className={act.quantityDelta > 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                              {act.quantityDelta > 0 ? '+' : ''}
                              {act.quantityDelta}
                            </span>
                          ),
                        },
                        { label: 'Date', value: <time dateTime={act.date}>{new Date(act.date).toLocaleDateString()}</time> },
                      ]}
                    />
                  </RecordCard>
                ))}
              >
                <DataTableScroll label="Recent inventory activity table" minWidth="32rem" className="flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4 whitespace-nowrap">Item</th>
                        <th className="py-3 px-4 whitespace-nowrap">Movement</th>
                        <th className="py-3 px-4 whitespace-nowrap">Qty</th>
                        <th className="py-3 px-4 whitespace-nowrap text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {recentStockActivity.slice(0, 5).map((act) => (
                        <tr key={act.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{act.catalogItemName}</p>
                            <p className="text-xs text-slate-400">{act.itemCode}</p>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                act.quantityDelta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {act.movementType}
                            </span>
                          </td>
                          <td
                            className={`py-3 px-4 whitespace-nowrap font-bold text-xs ${
                              act.quantityDelta > 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {act.quantityDelta > 0 ? `+${act.quantityDelta}` : act.quantityDelta}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-right text-xs text-slate-500">
                            {new Date(act.date).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTableScroll>
              </ResponsiveRecords>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
