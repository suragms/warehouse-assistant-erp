import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PermissionGate } from '../../auth/Guards';
import { Plus, Search } from 'lucide-react';
import { canPrintBarcode } from '../../lib/barcodes';
import { BarcodeLabels } from '../../components/BarcodeTools';
import { catalogApi } from '../../api/catalogApi';
import { catalogKeys, categoryKeys } from '../../lib/queryKeys';
import { PageHeader, Button, Skeleton, ErrorState, Badge, Pagination } from '../../components/ui';

export default function CatalogList() {
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const pageSize = 50;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: catalogKeys.list({ page, pageSize, search, categoryId }),
    queryFn: () => catalogApi.getItems(page, pageSize, search, categoryId || undefined),
    staleTime: 60 * 1000,
  });

  const { data: categories } = useQuery({
    queryKey: categoryKeys.lists(),
    queryFn: () => catalogApi.getCategories(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Catalog Items"
        subtitle="Manage master product records"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/catalog/barcodes"><Button variant="secondary">Barcode Manager</Button></Link>
            <PermissionGate permission="catalog.create"><Link to="/catalog/items/new">
              <Button icon={<Plus className="h-4 w-4" />}>New Item</Button>
            </Link></PermissionGate>
          </div>
        }
      />

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-[#E2E8E6] mb-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, code, barcode..."
            value={search}
            onChange={(e) => { setSelected([]); setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-[#E2E8E6] rounded-lg text-sm outline-none focus:border-[#159A8A]"
          />
        </div>
        <div className="w-full sm:w-auto">
          <select
            value={categoryId}
            onChange={(e) => { setSelected([]); setCategoryId(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-[#E2E8E6] rounded-lg text-sm bg-white outline-none focus:border-[#159A8A]"
          >
            <option value="">All Categories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <BarcodeLabels items={(data?.data || []).filter(item => selected.includes(item.id))} />
        <p className="text-sm">Select printable labels on this page. Archived items are excluded.</p>
      </div>
      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8E6] flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : error ? (
            <ErrorState onRetry={() => refetch()} />
          ) : data?.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No catalog items found.</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or create a new item.</p>
            </div>
          ) : (
            <table className="min-w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 text-[#475569] font-medium sticky top-0 z-10 border-b border-[#E2E8E6]">
                <tr>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3">Item Code</th>
                  <th className="px-4 py-3">Barcode</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Physical Stock</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E6]">
                {data?.data.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><input type="checkbox" aria-label={`Print label for ${item.name}`}
                      disabled={!item.isActive || !item.barcode || !canPrintBarcode(item.barcode)}
                      checked={selected.includes(item.id)} onChange={e => setSelected(values => e.target.checked ? [...values, item.id] : values.filter(id => id !== item.id))} /></td>
                    <td className="px-4 py-3 font-medium text-[#0F172A] max-w-[200px] truncate" title={item.name}>
                      <Link to={`/catalog/items/${item.id}`} className="hover:text-[#159A8A]">
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{item.itemCode}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.barcode || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span>{item.categoryName}</span>
                        {item.typeName && <span className="text-xs text-gray-500">{item.typeName}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {item.currentStock.toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.defaultUnit}
                    </td>
                    <td className="px-4 py-3">
                      {item.isActive ? (
                        <Badge variant="green">Active</Badge>
                      ) : (
                        <Badge variant="gray">Archived</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/catalog/items/${item.id}/edit`}>
                        <Button variant="ghost" size="sm" className="px-2">Edit</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data && data.meta.totalCount > 0 && (
          <div className="px-4 py-3 border-t border-[#E2E8E6]">
            <Pagination
              page={data.meta.page}
              pageSize={data.meta.pageSize}
              totalCount={data.meta.totalCount}
              totalPages={data.meta.totalPages}
              onPageChange={value => { setSelected([]); setPage(value); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import { Package } from 'lucide-react';
