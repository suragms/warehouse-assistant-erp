import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Plus, Barcode, CheckCircle } from 'lucide-react';
import { catalogApi, type CatalogItem } from '../../api/catalogApi';
import { barcodeKeys, catalogKeys } from '../../lib/queryKeys';
import { useAuthStore } from '../../stores/authStore';
import BarcodeAssignment from '../../components/BarcodeAssignment';
import { PageHeader, Card, Button, Input, Badge, Skeleton, ErrorState } from '../../components/ui';
import { BarcodeCamera, BarcodeLabel } from '../../components/BarcodeTools';
import { hasPermission } from '../../auth/hasPermission';

export default function BarcodeManager() {
  const { user } = useAuthStore();

  const hasEditPermission = hasPermission(user, 'catalog.edit');

  // -- Lookup State --
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: barcodeKeys.lookup(searchQuery),
    queryFn: () => catalogApi.lookupByBarcode(searchQuery),
    enabled: !!searchQuery,
    retry: false, // Don't retry on 404
  });

  const isNotFound = error && (error as { response?: { status?: number } }).response?.status === 404;

  const handleTryAgain = () => {
    setSearchQuery('');
    setInputValue('');
    inputRef.current?.focus();
  };

  const handleLookup = (value: string) => {
    const normalized = value.trim();
    if (!normalized || isFetching) return;
    if (normalized === searchQuery) void refetch();
    else setSearchQuery(normalized);
  };
  const handleSearchClick = () => handleLookup(inputValue);

  // -- Assign State --
  const [assignSearch, setAssignSearch] = useState('');
  const [debouncedAssignSearch, setDebouncedAssignSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedAssignSearch(assignSearch), 300);
    return () => clearTimeout(handler);
  }, [assignSearch]);

  const { data: assignCandidates, isLoading: isLoadingCandidates, error: candidatesError, refetch: retryCandidates } = useQuery({
    queryKey: catalogKeys.list({ page: 1, pageSize: 10, search: debouncedAssignSearch }),
    queryFn: () => catalogApi.getItems(1, 10, debouncedAssignSearch),
    enabled: !!debouncedAssignSearch && !selectedItem,
  });


  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Barcode Manager" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Lookup */}
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-4">Lookup Barcode</h2>
            <div className="flex gap-3 items-end">
              <div className="flex-1 min-w-0">
                <Input
                  ref={inputRef}
                  label="Scan or enter barcode"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSearchClick();
                    }
                  }}
                  placeholder="e.g. 123456789012"
                  autoFocus maxLength={100}
                />
              </div>
              <Button
                onClick={handleSearchClick}
                icon={<Search className="h-4 w-4" />}
                disabled={!inputValue.trim() || isFetching}
              >
                Search
              </Button>
            </div>
            <BarcodeCamera onDetected={value => { setInputValue(value); handleLookup(value); }} />
          </Card>

          {/* Results */}
          {searchQuery && (
            <div>
              {isLoading || isFetching ? (
                <Card className="p-6">
                  <Skeleton className="h-8 w-1/3 mb-4" />
                  <Skeleton className="h-6 w-1/2 mb-2" />
                  <Skeleton className="h-6 w-1/2" />
                </Card>
              ) : isNotFound ? (
                <Card className="p-6 border-red-200 bg-red-50 flex flex-col items-center text-center">
                  <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
                     <Barcode className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-red-800 mb-1">Unknown barcode</h3>
                  <p className="text-sm text-red-600 mb-5 max-w-sm">
                    This barcode is not assigned to any item
                  </p>
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={handleTryAgain}>Try Again</Button>
                    {hasPermission(user, 'catalog.create') && <Link to="/catalog/items/new">
                      <Button icon={<Plus className="h-4 w-4"/>}>Create New Item</Button>
                    </Link>}
                  </div>
                </Card>
              ) : data ? (
                <Card className="p-6 flex flex-col gap-4 border-emerald-200 bg-emerald-50/30">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                        {data.name}
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      </h3>
                      <p className="text-sm text-gray-600 font-mono mt-1 break-all">Barcode: {data.barcode}</p>
                    </div>
                    {data.isActive ? <Badge variant="green">Active</Badge> : <Badge variant="red">Archived</Badge>}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                    <div>
                      <span className="text-gray-500 block mb-1">Item Code</span>
                      <span className="font-medium text-[#0F172A]">{data.itemCode}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-1">Category</span>
                      <span className="font-medium text-[#0F172A]">{data.categoryName}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-1">Type</span>
                      <span className="font-medium text-[#0F172A]">{data.typeName || '—'}</span>
                    </div>
                  </div>

                  {!data.isActive && <p role="alert">This item is archived. Scanning has not changed stock.</p>}
                  <p>Current stock: {data.currentStock ?? 'Unavailable'} {data.defaultUnit}</p>
                  <p>Unit: {data.defaultUnit || 'Unavailable'}</p>
                  {data.barcode && <BarcodeLabel key={data.barcode} value={data.barcode} name={data.name} />}
                  <div className="pt-4 mt-2 border-t border-[#E2E8E6] flex justify-end">
                    <Link to={`/catalog/items/${data.id}`}>
                      <Button variant="secondary">Open Item</Button>
                    </Link>
                  </div>
                </Card>
              ) : error ? (
                <Card className="p-6">
                  <ErrorState message={(error as { response?: { data?: { error?: string; message?: string } } }).response?.data?.error === 'INVALID_BARCODE' ? 'Invalid barcode. Use at most 100 characters without control characters.' : "Failed to lookup barcode. Please try again."} onRetry={() => refetch()} />
                </Card>
              ) : null}
            </div>
          )}
        </div>

        {/* Right Column: Assign */}
        {hasEditPermission && (
          <div className="flex flex-col gap-6">
            <Card className="p-6 bg-gray-50/50">
              <h2 className="text-lg font-semibold text-[#0F172A] mb-4">Assign Barcode to Item</h2>

              <div className="flex flex-col gap-4">
                <div className="relative">
                  <Input
                    label="Search Item"
                    value={selectedItem ? selectedItem.name : assignSearch}
                    onChange={(e) => {
                      if (selectedItem) setSelectedItem(null);
                      setAssignSearch(e.target.value);
                    }}
                    placeholder="Type to search items..."
                  />
                  {!selectedItem && assignSearch.trim() && (
                    <div className="absolute top-full left-0 right-0 z-10 bg-white border border-[#E2E8E6] rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                      {isLoadingCandidates ? (
                        <div className="p-3 text-sm text-gray-500">Loading...</div>
                      ) : candidatesError ? (
                        <ErrorState message="Could not load items." onRetry={() => retryCandidates()} />
                      ) : assignCandidates?.data.length === 0 ? (
                        <div className="p-3 text-sm text-gray-500">No items found</div>
                      ) : (
                        <ul className="py-1">
                          {assignCandidates?.data.map(item => (
                            <li key={item.id}><button type="button"
                              onClick={() => {
                                setSelectedItem(item);
                                setAssignSearch('');
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer flex flex-col"
                            >
                              <span className="font-medium text-sm text-[#0F172A] truncate">{item.name}</span>
                              <span className="text-xs text-gray-500">
                                Code: {item.itemCode} | Barcode: {item.barcode || 'None'}
                              </span>
                            </button></li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {selectedItem ? <BarcodeAssignment key={selectedItem.id} item={selectedItem} onChanged={setSelectedItem} />
                  : <p className="text-sm">Choose an existing item to assign or generate a barcode.</p>}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
