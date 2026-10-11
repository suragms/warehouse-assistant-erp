import { ErrorState, Skeleton } from '../../components/ui';
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, PackageX, Package, ArrowRight } from 'lucide-react';
import { stockApi } from '../../api/stockApi';
import { stockKeys } from '../../lib/queryKeys';

export default function StockDashboard() {
  const { data: allStock, isPending: allPending, isError: allError, refetch: retryAll } = useQuery({
    queryKey: stockKeys.list({ page: 1, pageSize: 1 }),
    queryFn: () => stockApi.getItems(1, 1),
  });

  const { data: lowStock, isPending: lowPending, isError: lowError, refetch: retryLow } = useQuery({
    queryKey: stockKeys.lowStock({ page: 1, pageSize: 5 }),
    queryFn: () => stockApi.getLowStock(1, 5),
  });

  const { data: outOfStock, isPending: outPending, isError: outError, refetch: retryOut } = useQuery({
    queryKey: stockKeys.outOfStock({ page: 1, pageSize: 5 }),
    queryFn: () => stockApi.getOutOfStock(1, 5),
  });

  const totalItems = allStock?.meta.totalCount ?? 0;
  const lowCount = lowStock?.meta.totalCount ?? 0;
  const outCount = outOfStock?.meta.totalCount ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl break-words font-bold text-[#0E4F46]">Stock Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Current inventory status across all items</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Total Items"
          value={allPending || allError ? undefined : totalItems}
          icon={<Package className="h-5 w-5 text-[#0E4F46]" />}
          bg="bg-[#E8F5F3]"
          linkTo="/inventory/all"
        />
        <SummaryCard
          label="Low Stock"
          value={lowPending || lowError ? undefined : lowCount}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          bg="bg-amber-50"
          linkTo="/inventory/low-stock"
          warn={lowCount > 0}
        />
        <SummaryCard
          label="Out of Stock"
          value={outPending || outError ? undefined : outCount}
          icon={<PackageX className="h-5 w-5 text-red-500" />}
          bg="bg-red-50"
          linkTo="/inventory/out-of-stock"
          danger={outCount > 0}
        />
      </div>

      {(allPending || lowPending || outPending) && <div role="status" aria-label="Loading stock counts"><Skeleton className="h-16" /></div>}
      {allError && <ErrorState message="Total stock count could not be loaded." onRetry={() => void retryAll()} />}
      {lowError && <ErrorState message="Low-stock alerts could not be loaded." onRetry={() => void retryLow()} />}
      {outError && <ErrorState message="Out-of-stock alerts could not be loaded." onRetry={() => void retryOut()} />}
      {/* Alerts */}
      {outCount > 0 && (
        <AlertSection
          title="Out of Stock"
          items={outOfStock?.data ?? []}
          totalCount={outCount}
          linkTo="/inventory/out-of-stock"
          variant="danger"
        />
      )}
      {lowCount > 0 && (
        <AlertSection
          title="Low Stock"
          items={lowStock?.data ?? []}
          totalCount={lowCount}
          linkTo="/inventory/low-stock"
          variant="warn"
        />
      )}
    </div>
  );
}

function SummaryCard({
  label, value, icon, bg, linkTo, warn, danger
}: {
  label: string;
  value?: number;
  icon: React.ReactNode;
  bg: string;
  linkTo: string;
  warn?: boolean;
  danger?: boolean;
}) {
  return (
    <Link
      to={linkTo}
      className={`flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-4 hover:shadow-md transition-shadow ${
        danger ? 'border-red-200 bg-red-50' : warn ? 'border-amber-200 bg-amber-50' : 'border-[#C7E0DC] bg-[#E8F5F3]'
      }`}
    >
      <div className={`p-2 rounded-lg ${bg}`}>{icon}</div>
      <div>
        <p className="text-2xl break-words font-bold text-[#0E4F46]">{value ?? 'Unavailable'}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </Link>
  );
}

function AlertSection({
  title, items, totalCount, linkTo, variant
}: {
  title: string;
  items: { id: string; name: string; itemCode: string; availableStock: number; reorderLevel: number; defaultUnit: string }[];
  totalCount: number;
  linkTo: string;
  variant: 'warn' | 'danger';
}) {
  const borderColor = variant === 'danger' ? 'border-red-200' : 'border-amber-200';
  const headerBg = variant === 'danger' ? 'bg-red-50' : 'bg-amber-50';
  const titleColor = variant === 'danger' ? 'text-red-700' : 'text-amber-700';

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
      <div className={`flex flex-wrap gap-3 items-center justify-between px-4 py-3 ${headerBg}`}>
        <span className={`font-semibold text-sm ${titleColor}`}>{title} ({totalCount})</span>
        <Link to={linkTo} className={`text-xs flex items-center gap-1 ${titleColor} hover:underline`}>
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="divide-y divide-gray-100">
        {items.map(item => (
          <Link
            key={item.id}
            to={`/inventory/${item.id}`}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-sm break-words font-medium text-gray-900">{item.name}</p>
              <p className="text-xs text-gray-400">{item.itemCode}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${variant === 'danger' ? 'text-red-600' : 'text-amber-600'}`}>
                {item.availableStock} {item.defaultUnit}
              </p>
              <p className="text-xs text-gray-400">Reorder: {item.reorderLevel}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
