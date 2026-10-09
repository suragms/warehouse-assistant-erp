import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { catalogApi, type DuplicateCandidate } from '../../api/catalogApi';
import { duplicateKeys, catalogKeys } from '../../lib/queryKeys';
import { useAuthStore } from '../../stores/authStore';
import { useToast } from '../../components/ui/toastContext';
import {
  PageHeader,
  Card,
  Button,
  Select,
  ConfirmDialog,
  EmptyState,
  ErrorState,
} from '../../components/ui';
import { CopyX } from 'lucide-react';

export default function DuplicateReview() {
  const [threshold, setThreshold] = useState<number>(70);
  const [itemToArchive, setItemToArchive] = useState<{ id: string; name: string } | null>(null);

  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const user = useAuthStore((s) => s.user);

  const hasArchivePermission = user?.currentBusiness?.permissions?.includes('catalog.archive') ?? false;

  const {
    data: duplicates,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: duplicateKeys.list(threshold),
    queryFn: () => catalogApi.getDuplicateCandidates(threshold),
  });

  const candidateList: DuplicateCandidate[] = Array.isArray(duplicates) ? duplicates : ((duplicates as any)?.data ?? []);

  const archiveMutation = useMutation({
    mutationFn: (id: string) => catalogApi.deleteItem(id),
    onSuccess: () => {
      showToast('Item archived successfully');
      queryClient.invalidateQueries({ queryKey: duplicateKeys.list(threshold) });
      queryClient.invalidateQueries({ queryKey: catalogKeys.lists() });
      setItemToArchive(null);
    },
    onError: (err: { message?: string }) => {
      showToast(err?.message || 'Failed to archive item', 'error');
      setItemToArchive(null);
    },
  });

  const handleArchiveConfirm = () => {
    if (itemToArchive) {
      archiveMutation.mutate(itemToArchive.id);
    }
  };

  const buttonClass = "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 px-4 py-2 text-sm";
  const secondaryButtonClass = `${buttonClass} bg-white text-[#0E4F46] border border-[#0E4F46] hover:bg-[#F7F9F6] focus:ring-[#159A8A]`;

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <PageHeader
        title="Duplicate Review"
        subtitle="Review potential duplicate catalog items"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Threshold:</span>
            <Select
              value={threshold.toString()}
              onChange={(e) => setThreshold(Number(e.target.value))}
              options={[
                { value: '50', label: '50%' },
                { value: '60', label: '60%' },
                { value: '70', label: '70%' },
                { value: '80', label: '80%' },
                { value: '90', label: '90%' },
              ]}
              className="w-24"
            />
          </div>
        }
      />

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 sm:p-6 animate-pulse">
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 h-24 bg-gray-200 rounded"></div>
                <div className="hidden lg:block w-8 h-8 self-center bg-gray-200 rounded-full"></div>
                <div className="flex-1 h-24 bg-gray-200 rounded"></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load duplicates'}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && candidateList.length === 0 && (
        <EmptyState
          icon={<CopyX className="w-12 h-12" />}
          title="No duplicates found"
          description="No potential duplicates found at this similarity threshold."
        />
      )}

      {!isLoading && !isError && candidateList.length > 0 && (
        <div className="space-y-6">
          {candidateList.map((pair) => (
            <Card key={`${pair.itemAId}-${pair.itemBId}`} className="p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Item A */}
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Item A</span>
                  </div>
                  <h3 className="font-semibold text-lg text-[#0F172A] mb-1">{pair.itemAName}</h3>
                  <div className="text-sm text-[#475569] space-y-1">
                    <p>
                      <span className="font-medium text-gray-700">Code:</span> {pair.itemACode}
                      {pair.itemABarcode && (
                        <span className="ml-2 pl-2 border-l border-gray-300">
                          <span className="font-medium text-gray-700">Barcode:</span> {pair.itemABarcode}
                        </span>
                      )}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">Category:</span> {pair.itemACategoryName}
                      {pair.itemATypeName && ` / ${pair.itemATypeName}`}
                    </p>
                  </div>
                </div>

                {/* VS Badge */}
                <div className="hidden lg:flex items-center justify-center">
                  <div className="bg-gray-100 text-gray-500 rounded-full w-10 h-10 flex items-center justify-center font-bold text-sm">
                    VS
                  </div>
                </div>

                {/* Item B */}
                <div className="flex-1 lg:pt-0 pt-4 lg:border-t-0 border-t">
                  <div className="flex items-center mb-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Item B</span>
                  </div>
                  <h3 className="font-semibold text-lg text-[#0F172A] mb-1">{pair.itemBName}</h3>
                  <div className="text-sm text-[#475569] space-y-1">
                    <p>
                      <span className="font-medium text-gray-700">Code:</span> {pair.itemBCode}
                      {pair.itemBBarcode && (
                        <span className="ml-2 pl-2 border-l border-gray-300">
                          <span className="font-medium text-gray-700">Barcode:</span> {pair.itemBBarcode}
                        </span>
                      )}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">Category:</span> {pair.itemBCategoryName}
                      {pair.itemBTypeName && ` / ${pair.itemBTypeName}`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-50 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 py-4 rounded-b-xl">
                <div className="text-sm flex flex-col">
                  <span className="font-semibold text-emerald-700">
                    Similarity: {Math.round(pair.similarityScore)}%
                  </span>
                  <span className="text-gray-500 mt-1">
                    Reasons: {pair.matchReasons.join(', ')}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                  <Link
                    to={`/catalog/items/${pair.itemAId}`}
                    className={secondaryButtonClass}
                  >
                    View Item A
                  </Link>
                  <Link
                    to={`/catalog/items/${pair.itemBId}`}
                    className={secondaryButtonClass}
                  >
                    View Item B
                  </Link>
                  {hasArchivePermission && (
                    <Button
                      variant="danger"
                      onClick={() => setItemToArchive({ id: pair.itemBId, name: pair.itemBName })}
                    >
                      Archive Item B
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={itemToArchive !== null}
        title="Archive Item?"
        description={`Archive ${itemToArchive?.name}? This will remove it from active catalog.`}
        confirmLabel="Archive"
        variant="danger"
        loading={archiveMutation.isPending}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setItemToArchive(null)}
      />
    </div>
  );
}
