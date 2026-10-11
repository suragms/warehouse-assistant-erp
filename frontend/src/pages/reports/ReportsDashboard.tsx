import { DataTableScroll } from '../../components/ui/ResponsiveRecords';
import { ExportControls } from '../../components/ExportControls';
import { ServerDownload } from '../../components/ServerDownload';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../auth/hasPermission';
import { formatMoney } from '../../lib/formatMoney';
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportApi } from '../../api/reportApi';
import { reportKeys } from '../../lib/queryKeys';
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Package, AlertTriangle, PackageX, Calendar
} from 'lucide-react';
import { PageHeader, ErrorState } from '../../components/ui';

export default function ReportsDashboard() {
  const user = useAuthStore(s => s.user);
  const [activeTab, setActiveTab] = useState<'spend' | 'summary' | 'stock' | 'comparison'>('spend');
  const [dateRange, setDateRange] = useState<'30' | '90' | '365'>('30');
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
  const [reportAnchor] = useState(() => Date.now());

  // Keep UTC bounds stable across renders while including today's activity.
  const { startDate, endDate } = useMemo(() => {
    const end = new Date(reportAnchor); const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - Number(dateRange));
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [dateRange, reportAnchor]);

  const { data: spendData, isLoading: spendLoading, error: spendError, refetch: retrySpend } = useQuery({
    queryKey: reportKeys.spend({ startDate, endDate, groupBy }),
    queryFn: () => reportApi.getSpendAnalytics(startDate, endDate, groupBy),
  });

  const { data: summaryData, isLoading: summaryLoading, error: summaryError, refetch: retrySummary } = useQuery({
    queryKey: reportKeys.summary({ startDate, endDate }),
    queryFn: () => reportApi.getPurchaseSummary(startDate, endDate),
  });

  const { data: stockData, isLoading: stockLoading, error: stockError, refetch: retryStock } = useQuery({
    queryKey: reportKeys.stock(),
    queryFn: () => reportApi.getStockAnalytics(),
  });

  const { data: comparisonData, error: comparisonError, refetch: retryComparison } = useQuery({
    queryKey: reportKeys.comparison({ startDate, endDate }),
    queryFn: () => reportApi.getPeriodComparison(startDate, endDate),
  });


  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Reports & Analytics"
          subtitle="Comprehensive procurement spend analysis, inventory valuation, and period comparisons."
        />

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1">
            <Calendar className="w-4 h-4 ml-2 text-slate-400" />
            <select aria-label="Reporting period"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as '30' | '90' | '365')}
              className="bg-transparent text-sm text-slate-700 font-medium px-2 py-1 outline-none cursor-pointer"
            >
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="365">Last 365 Days</option>
            </select>
          </div>
        </div>
      </div>

      <ExportControls start={startDate} end={endDate} />
      {hasPermission(user, 'stock.view') && <ServerDownload path="/exports/movements.csv" filename="movements.csv" label="Stock activity CSV" params={{ start: startDate, end: endDate }} />}
      {comparisonError && <ErrorState message="Period comparison could not be loaded." onRetry={() => void retryComparison()} />}
      {/* Period Comparison Metric Cards */}
      {comparisonData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <MetricCard
            title="Total Spend"
            current={comparisonData.currentPeriodSpend}
            previous={comparisonData.previousPeriodSpend}
            change={comparisonData.spendChangePercentage}
            isCurrency
            icon={<DollarSign className="w-5 h-5 text-indigo-600" />}
            bg="bg-indigo-50"
          />
          <MetricCard
            title="Total Orders"
            current={comparisonData.currentPeriodOrders}
            previous={comparisonData.previousPeriodOrders}
            change={comparisonData.ordersChangePercentage}
            icon={<ShoppingCart className="w-5 h-5 text-emerald-600" />}
            bg="bg-emerald-50"
          />
          <MetricCard
            title="Avg Order Value"
            current={comparisonData.currentPeriodAvgOrderValue}
            previous={comparisonData.previousPeriodAvgOrderValue}
            change={comparisonData.avgOrderValueChangePercentage}
            isCurrency
            icon={<BarChart3 className="w-5 h-5 text-amber-600" />}
            bg="bg-amber-50"
          />
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Report sections" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const keys = ['spend', 'summary', 'stock'] as const;
        const index = keys.indexOf(activeTab as typeof keys[number]);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
        setActiveTab(keys[next]); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }} className="border-b border-slate-200 flex flex-wrap gap-4">
        <button
          role="tab" tabIndex={activeTab === 'spend' ? 0 : -1} aria-selected={activeTab === 'spend'} aria-controls="report-panel" onClick={() => setActiveTab('spend')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'spend'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Spend Analytics
        </button>
        <button
          role="tab" tabIndex={activeTab === 'summary' ? 0 : -1} aria-selected={activeTab === 'summary'} aria-controls="report-panel" onClick={() => setActiveTab('summary')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'summary'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Purchase Summaries
        </button>
        <button
          role="tab" tabIndex={activeTab === 'stock' ? 0 : -1} aria-selected={activeTab === 'stock'} aria-controls="report-panel" onClick={() => setActiveTab('stock')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'stock'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Stock & Inventory
        </button>
      </div>

      <div id="report-panel" role="tabpanel" aria-label="Selected report">
      {/* Tab 1: Spend Analytics */}
      {activeTab === 'spend' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-6 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">Spend Over Time</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Group By:</span>
              <button
                onClick={() => setGroupBy('day')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  groupBy === 'day' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setGroupBy('month')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  groupBy === 'month' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {spendError ? <ErrorState message="Spend analytics could not be loaded." onRetry={() => void retrySpend()} /> : spendLoading ? (
            <div className="py-12 text-center text-slate-500">Loading spend analytics...</div>
          ) : !spendData || spendData.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No spend data recorded for this date range.</div>
          ) : (
            <DataTableScroll label="Spend over time" minWidth="28rem">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Period</th>
                    <th className="py-3 px-4">Orders Count</th>
                    <th className="py-3 px-4 text-right">Total Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {spendData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-slate-900">{item.periodLabel}</td>
                      <td className="py-3.5 px-4 text-slate-600">{item.purchaseCount}</td>
                      <td className="py-3.5 px-4 text-right font-semibold text-indigo-600">
                        {formatMoney(item.totalSpend)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableScroll>
          )}
        </div>
      )}

      {/* Tab 2: Purchase Summaries */}
      {activeTab === 'summary' && (
        <div className="space-y-6 min-w-0">
          {summaryError ? <ErrorState message="Purchase summary could not be loaded." onRetry={() => void retrySummary()} /> : summaryLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
              Loading purchase summaries...
            </div>
          ) : summaryData ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By Supplier */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4 min-w-0">
                <h3 className="text-base font-bold text-slate-900">Spend by Supplier</h3>
                {summaryData.bySupplier.length === 0 ? (
                  <p className="text-sm text-slate-400">No supplier spend data available.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {summaryData.bySupplier.map((item, idx) => (
                      <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-sm min-w-0">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 break-words">{item.key}</p>
                          <p className="text-xs text-slate-400">{item.count} orders</p>
                        </div>
                        <span className="font-bold text-indigo-600 break-words">
                          {formatMoney(item.totalSpend)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* By Category */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4 min-w-0">
                <h3 className="text-base font-bold text-slate-900">Spend by Category</h3>
                {summaryData.byCategory.length === 0 ? (
                  <p className="text-sm text-slate-400">No category spend data available.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {summaryData.byCategory.map((item, idx) => (
                      <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-sm min-w-0">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 break-words">{item.key}</p>
                          <p className="text-xs text-slate-400">{item.count} orders</p>
                        </div>
                        <span className="font-bold text-indigo-600 break-words">
                          {formatMoney(item.totalSpend)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Tab 3: Stock & Inventory Analytics */}
      {activeTab === 'stock' && (
        <div className="space-y-6 min-w-0">
          {stockError ? <ErrorState message="Stock analytics could not be loaded." onRetry={() => void retryStock()} /> : stockLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
              Loading stock analytics...
            </div>
          ) : stockData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-500">Total Catalog Items</span>
                  <Package className="w-5 h-5 text-indigo-600" />
                </div>
                <p className="text-3xl font-bold text-slate-900">{stockData.totalCatalogItems}</p>
                <p className="text-xs text-slate-400">Saved SKUs including inactive items</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-500">Low Stock Items</span>
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <p className="text-3xl font-bold text-amber-600">{stockData.lowStockCount}</p>
                <p className="text-xs text-slate-400">At or below reorder point</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-500">Out of Stock</span>
                  <PackageX className="w-5 h-5 text-red-600" />
                </div>
                <p className="text-3xl font-bold text-red-600">{stockData.outOfStockCount}</p>
                <p className="text-xs text-slate-400">Zero available stock</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-500">Stock Movements</span>
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="text-3xl font-bold text-emerald-600">{stockData.totalMovementsCount}</p>
                <p className="text-xs text-slate-400">Total recorded audit events</p>
              </div>
            </div>
          ) : null}
        </div>
      )}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  current,
  previous,
  change,
  isCurrency = false,
  icon,
  bg,
}: {
  title: string;
  current: number;
  previous: number;
  change: number;
  isCurrency?: boolean;
  icon: React.ReactNode;
  bg: string;
}) {
  const isPositiveGood = title !== 'Total Spend';
  const isPositive = change >= 0;
  const isGood = isPositiveGood ? isPositive : !isPositive;

  const formatVal = (val: number) =>
    isCurrency
      ? formatMoney(val)
      : val.toLocaleString();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        <div className={`p-2 rounded-lg ${bg}`}>{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 break-words">{formatVal(current)}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${
              isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {Number.isFinite(change) && (isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
            {Number.isFinite(change) ? `${isPositive ? '+' : ''}${change}%` : 'Owner only'}
          </span>
          <span className="text-xs text-slate-400">vs prev period ({formatVal(previous)})</span>
        </div>
      </div>
    </div>
  );
}
