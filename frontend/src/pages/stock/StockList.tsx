import React, { useState } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, AlertTriangle, PackageX } from 'lucide-react';
import { stockApi } from '../../api/stockApi';
import type { StockItem } from '../../api/stockApi';
import { CsvExportButton } from '../../components/CsvExportButton';
import { stockKeys } from '../../lib/queryKeys';
import apiClient from '../../api/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../auth/hasPermission';

type StockFilter = 'all' | 'low-stock' | 'out-of-stock';

export default function StockList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const user = useAuthStore(s => s.user);
  const categoryId = searchParams.get('categoryId') || undefined, supplierId = searchParams.get('supplierId') || undefined, severity = searchParams.get('severity') || undefined;
  const filters = { categoryId, supplierId, severity };
  const options = useQuery({ queryKey: ['stock-filter-options', user?.currentBusiness?.businessId], queryFn: async () => (await apiClient.get<{ categories: { id: string; name: string }[]; suppliers: { id: string; name: string }[] }>('/stock/filter-options')).data });
  const changeFilter = (name: string, value: string) => { const next = new URLSearchParams(searchParams); if (value) next.set(name, value); else next.delete(name); next.set('page', '1'); setSearchParams(next); };
  const location = useLocation();
  const requestedFilter = searchParams.get('filter') ?? location.pathname.split('/').at(-1);
  const filter: StockFilter = requestedFilter === 'low-stock' || requestedFilter === 'out-of-stock' ? requestedFilter : 'all';
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  const queryFn =
    filter === 'low-stock'
      ? () => stockApi.getLowStock(page, 50, search || undefined, filters)
      : filter === 'out-of-stock'
      ? () => stockApi.getOutOfStock(page, 50, search || undefined, filters)
      : () => stockApi.getItems(page, 50, search || undefined, filters);

  const queryKey =
    filter === 'low-stock'
      ? stockKeys.lowStock({ page, search })
      : filter === 'out-of-stock'
      ? stockKeys.outOfStock({ page, search })
      : stockKeys.list({ page, search });

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKey, filters], queryFn });

  const setFilter = (f: StockFilter) => {
    changeFilter('filter', f);
  };

  const tabs: { key: StockFilter; label: string; icon?: React.ReactNode }[] = [
    { key: 'all', label: 'All Items' },
    { key: 'low-stock', label: 'Low Stock', icon: <AlertTriangle className="h-3 w-3" /> },
    { key: 'out-of-stock', label: 'Out of Stock', icon: <PackageX className="h-3 w-3" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-[#0E4F46]">Inventory</h1>
        <CsvExportButton kind={filter === 'low-stock' ? 'low-stock' : 'stock'} label={filter === 'low-stock' ? 'Low-stock CSV' : 'Stock CSV'} params={{ filter, search: search || undefined, ...filters }} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-white text-[#0E4F46] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search items…"
          value={search}
          maxLength={200}
          onChange={e => { setSearch(e.target.value); changeFilter('page', '1'); }}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46]/20 focus:border-[#0E4F46]"
        />
      </div>

      {/* Table */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm min-w-0">Category<select className="block border rounded p-2 w-full mt-1" value={categoryId ?? ''} onChange={e => changeFilter('categoryId', e.target.value)}><option value="">All categories</option>{options.data?.categories?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        {hasPermission(user, 'supplier.view') && <label className="text-sm min-w-0">Supplier<select className="block border rounded p-2 w-full mt-1" value={supplierId ?? ''} onChange={e => changeFilter('supplierId', e.target.value)}><option value="">All suppliers</option>{options.data?.suppliers?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <label className="text-sm">Severity<select className="block border rounded p-2 w-full mt-1" value={severity ?? ''} onChange={e => changeFilter('severity', e.target.value)}><option value="">All severities</option>{['critical', 'low', 'out', 'healthy'].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      </div>
      {options.isError && <p role="alert">Filter options are unavailable. Item search still works. <button className="underline" onClick={() => void options.refetch()}>Retry filters</button></p>}
      {filter !== 'all' && hasPermission(user, 'purchase.create') && <Link className="inline-block text-teal-700 underline py-2" to="/purchases/new">Review a reorder purchase</Link>}
      {isError && <p role="alert">Stock could not be loaded. <button className="underline" onClick={() => void refetch()}>Retry</button></p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <span className="animate-spin h-6 w-6 border-2 border-[#0E4F46] border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Item', 'System Stock', 'Physical', 'Reserved', 'Available', 'Reorder Level', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.data ?? []).map(item => (
                <StockRow key={item.id} item={item} />
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {(page - 1) * 50 + 1}–{Math.min(page * 50, data.meta.totalCount)} of {data.meta.totalCount}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), filter, page: String(page - 1) })}
              className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              disabled={page >= data.meta.totalPages}
              onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), filter, page: String(page + 1) })}
              className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StockRow({ item }: { item: StockItem }) {
  const isOutOfStock = item.availableStock <= 0;
  const isLow = !isOutOfStock && item.availableStock <= item.reorderLevel;

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900">{item.name}</p>
        <p className="text-xs text-gray-400">{item.itemCode}{item.barcode ? ` · ${item.barcode}` : ''}</p>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {item.systemStock} {item.defaultUnit}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {item.physicalStock} {item.defaultUnit}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {item.reservedStock} {item.defaultUnit}
      </td>
      <td className="px-4 py-3">
        <span className={`text-sm font-semibold ${isOutOfStock ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-[#0E4F46]'}`}>
          {item.availableStock} {item.defaultUnit}
        </span>
        {isOutOfStock && (
          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Out</span>
        )}
        {isLow && (
          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Low</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {item.reorderLevel} {item.defaultUnit}
      </td>
      <td className="px-4 py-3">
        <Link
          to={`/inventory/${item.id}`}
          className="text-sm text-[#0E4F46] hover:underline font-medium"
        >
          View
        </Link>
      </td>
    </tr>
  );
}
