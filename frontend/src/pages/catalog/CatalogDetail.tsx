import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, Archive, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { catalogApi } from '../../api/catalogApi';
import { invalidateBarcodeQueries } from '../../lib/barcodes';
import { catalogKeys } from '../../lib/queryKeys';
import { PageHeader, Button, Card, Badge, Skeleton, ErrorState, ConfirmDialog } from '../../components/ui';
import { useToast } from '../../components/ui/toastContext';
import { PermissionGate } from '../../auth/Guards';
import { BarcodeLabel } from '../../components/BarcodeTools';
import BarcodeAssignment from '../../components/BarcodeAssignment';
import CatalogVariants from './CatalogVariants';

export default function CatalogDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const { data: item, isLoading, error } = useQuery({
    queryKey: catalogKeys.detail(id!),
    queryFn: () => catalogApi.getItemById(id!),
  });

  const deleteMutation = useMutation({
    mutationFn: () => catalogApi.archiveItem(id!, item!.rowVersion),
    onSuccess: () => {
      void invalidateBarcodeQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: catalogKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      showToast('Item archived successfully', 'success');
      navigate('/catalog/items');
    },
    onError: (err: { normalized?: string | { message?: string } }) => {
      setDeleteOpen(false);
      const msg = typeof err.normalized === 'string' ? err.normalized : err.normalized?.message || 'Could not archive item. It may be in use.';
      showToast(msg, 'error');
    }
  });

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  if (error || !item) {
    return <ErrorState message="Item not found or failed to load." onRetry={() => navigate('/catalog/items')} />;
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="mb-4">
        <Link to="/catalog/items" className="inline-flex items-center text-sm text-[#159A8A] hover:underline">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Catalog
        </Link>
      </div>

      <PageHeader
        title={item.name}
        subtitle={`Item Code: ${item.itemCode}`}
        actions={
          <>
            <PermissionGate permission="catalog.edit"><Link to={`/catalog/items/${item.id}/edit`}>
              <Button variant="secondary" icon={<Edit className="h-4 w-4" />}>Edit</Button>
            </Link></PermissionGate>
            {item.isActive && <PermissionGate permission="catalog.archive"><Button variant="danger" icon={<Archive className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>
              Archive
            </Button></PermissionGate>}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-medium text-[#0F172A] border-b pb-2 mb-4">Overview</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
              <div>
                <dt className="text-sm font-medium text-gray-500">Barcode</dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono">{item.barcode || '—'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Status</dt>
                <dd className="mt-1">
                  {item.isActive ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Archived</Badge>}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Category</dt>
                <dd className="mt-1 text-sm text-gray-900">{item.categoryName}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Type</dt>
                <dd className="mt-1 text-sm text-gray-900">{item.typeName || '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between border-b pb-2 mb-4">
              <h3 className="text-lg font-medium text-[#0F172A]">Inventory Parameters</h3>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-6">
              <div>
                <dt className="text-sm font-medium text-gray-500">Default Unit</dt>
                <dd className="mt-1 text-sm text-gray-900">{item.defaultUnit}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Kg per Unit</dt>
                <dd className="mt-1 text-sm text-gray-900">{item.kgPerUnit || '—'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Reorder Level</dt>
                <dd className="mt-1 text-sm text-gray-900">{item.reorderLevel}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-6 space-y-4">
            {item.barcode ? <BarcodeLabel value={item.barcode} name={item.name} /> : <p>No barcode assigned.</p>}
            <BarcodeAssignment item={item} />
          </Card>

          <CatalogVariants itemId={item.id} variants={item.variants} />

          <Card className="p-6">
            <h3 className="text-lg font-medium text-[#0F172A] border-b pb-2 mb-4">Purchase History</h3>
            <div className="flex flex-col items-center justify-center py-6">
              <p className="text-sm text-gray-500 text-center">No purchase history yet.</p>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 bg-[#0E4F46] text-white">
            <h3 className="text-sm font-medium text-[#B8D4CF] mb-1">Current System Stock</h3>
            <div className="text-4xl font-bold">
              {item.currentStock.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className="text-xl font-normal ml-2 text-[#8FC4BC]">{item.defaultUnit}</span>
            </div>
            {item.currentStock <= item.reorderLevel && item.reorderLevel > 0 && (
              <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/20 text-yellow-200 text-sm rounded-full">
                <AlertCircle className="h-4 w-4" />
                Below reorder level
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-medium text-[#0F172A] border-b pb-2 mb-4">Recent Sourcing</h3>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-gray-500 uppercase font-medium">Last Supplier</span>
                {item.lastSupplierId ? (
                  <Link to={`/suppliers/${item.lastSupplierId}`} className="mt-1 flex items-center text-sm text-[#159A8A] font-medium hover:underline">
                    <LinkIcon className="h-3 w-3 mr-1" />
                    {item.lastSupplierName}
                  </Link>
                ) : (
                  <p className="mt-1 text-sm text-gray-500">—</p>
                )}
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase font-medium">Last Broker</span>
                {item.lastBrokerId ? (
                  <Link to={`/brokers/${item.lastBrokerId}`} className="mt-1 flex items-center text-sm text-[#159A8A] font-medium hover:underline">
                    <LinkIcon className="h-3 w-3 mr-1" />
                    {item.lastBrokerName}
                  </Link>
                ) : (
                  <p className="mt-1 text-sm text-gray-500">—</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={`Archive ${item.name}?`}
        description="Archived items are hidden from active catalog lists but remain available for historical records. This action can be reversed by editing the item."
        confirmLabel="Archive Item"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
