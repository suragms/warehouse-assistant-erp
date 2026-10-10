import React, { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { catalogApi, type CatalogItem } from '../../api/catalogApi';
import { barcodeValidation, invalidateBarcodeQueries, barcodeError } from '../../lib/barcodes';
import { catalogKeys, categoryKeys } from '../../lib/queryKeys';
import { PageHeader, Button, Input, Select, Card, Skeleton, ConfirmDialog, ErrorState } from '../../components/ui';
import { useToast } from '../../components/ui/toastContext';

// All fields are strings so they map cleanly to HTML inputs;
// numeric fields are converted to numbers at submit time.
interface ItemFormValues {
  name: string;
  itemCode: string;
  barcode: string;
  categoryId: string;
  typeId: string;
  defaultUnit: string;
  kgPerUnit: string;
  reorderLevel: string;
  isActive: boolean;
  rowVersion: string;
}

function validateForm(data: ItemFormValues, existingBarcode?: string | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.name.trim()) errors.name = 'Name is required';
  else if (data.name.length > 200) errors.name = 'Name must be 200 characters or less';
  if (!data.itemCode.trim()) errors.itemCode = 'Item Code is required';
  else if (data.itemCode.length > 50) errors.itemCode = 'Item Code must be 50 characters or less';
  const barcodeIssue = data.barcode === existingBarcode ? undefined : barcodeValidation(data.barcode);
  if (barcodeIssue) errors.barcode = barcodeIssue;
  if (!data.categoryId) errors.categoryId = 'Category is required';
  if (!data.defaultUnit) errors.defaultUnit = 'Unit is required';
  if (data.kgPerUnit && (isNaN(parseFloat(data.kgPerUnit)) || parseFloat(data.kgPerUnit) <= 0))
    errors.kgPerUnit = 'Must be a positive number';
  if (data.reorderLevel && (isNaN(parseFloat(data.reorderLevel)) || parseFloat(data.reorderLevel) < 0))
    errors.reorderLevel = 'Must be zero or greater';
  return errors;
}

export default function CatalogForm({ edit = false }: { edit?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [conflictDialogOpen, setConflictDialogOpen] = React.useState(false);

  const { data: item, isLoading: isLoadingItem, error: itemError } = useQuery({
    queryKey: catalogKeys.detail(id!),
    queryFn: () => catalogApi.getItemById(id!),
    enabled: edit && !!id,
    staleTime: 0,
  });

  const { data: categories } = useQuery({
    queryKey: categoryKeys.lists(),
    queryFn: () => catalogApi.getCategories(),
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<ItemFormValues>({
    defaultValues: {
      name: '',
      itemCode: '',
      barcode: '',
      categoryId: '',
      typeId: '',
      defaultUnit: 'PCS',
      kgPerUnit: '',
      reorderLevel: '0',
      isActive: true,
      rowVersion: '',
    }
  });

  const selectedCategoryId = useWatch({ control, name: 'categoryId' });
  const selectedTypeId = useWatch({ control, name: 'typeId' });

  const { data: types } = useQuery({
    queryKey: ['categories', selectedCategoryId, 'types'],
    queryFn: async () => {
      const res = await import('../../api/apiClient').then(m => m.default.get(`/catalog/categories/${selectedCategoryId}/types`));
      return res.data;
    },
    enabled: !!selectedCategoryId,
  });

  useEffect(() => {
    if (edit && item) {
      reset({
        name: item.name,
        itemCode: item.itemCode,
        barcode: item.barcode || '',
        categoryId: item.categoryId,
        typeId: item.typeId || '',
        defaultUnit: item.defaultUnit,
        kgPerUnit: item.kgPerUnit != null ? String(item.kgPerUnit) : '',
        reorderLevel: item.reorderLevel != null ? String(item.reorderLevel) : '0',
        isActive: item.isActive,
        rowVersion: item.rowVersion || '',
      });
    }
  }, [edit, item, reset]);

  // Clear type when category changes to an incompatible one
  useEffect(() => {
    if (selectedCategoryId && types) {
      if (selectedTypeId && !types.find((t: { id: string; name: string }) => t.id === selectedTypeId)) {
        setValue('typeId', '');
      }
    }
  }, [selectedCategoryId, selectedTypeId, types, setValue]);

  const mutation = useMutation({
    mutationFn: (data: ItemFormValues) => {
      const payload: Partial<CatalogItem> = {
        name: data.name.trim(),
        itemCode: data.itemCode.trim(),
        barcode: data.barcode.trim() || null,
        categoryId: data.categoryId,
        typeId: data.typeId || undefined,
        defaultUnit: data.defaultUnit,
        kgPerUnit: data.kgPerUnit ? parseFloat(data.kgPerUnit) : undefined,
        reorderLevel: data.reorderLevel ? parseFloat(data.reorderLevel) : 0,
        isActive: data.isActive,
        rowVersion: data.rowVersion || undefined,
      };
      if (edit) {
        return catalogApi.updateItem(id!, payload);
      }
      return catalogApi.createItem(payload);
    },
    onSuccess: (res) => {
      void invalidateBarcodeQueries(queryClient);
      if (edit) queryClient.invalidateQueries({ queryKey: catalogKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: ['search'] });

      showToast(edit ? 'Item updated successfully' : 'Item created successfully', 'success');
      navigate(edit ? `/catalog/items/${id}` : `/catalog/items/${res.id}`);
    },
    onError: (err: { normalized?: string | { message?: string }; response?: { data?: { error?: string } } }) => {
      const msg = typeof err.normalized === 'string' ? err.normalized : err.normalized?.message;
      if (err.response?.data?.error === 'DUPLICATE_BARCODE') {
        setError('barcode', { type: 'manual', message: barcodeError(err) });
      } else if (msg === 'DUPLICATE_ITEM_CODE_OR_BARCODE') {
        setError('itemCode', { type: 'manual', message: 'Item code or barcode already exists.' });
        setError('barcode', { type: 'manual', message: 'If barcode is provided, it might be a duplicate.' });
        showToast('Duplicate identifier detected. Please check item code and barcode.', 'error');
      } else if (msg === 'CATALOG_ITEM_VERSION_CONFLICT') {
        setConflictDialogOpen(true);
      } else {
        showToast('Failed to save item', 'error');
      }
    }
  });

  const onSubmit = (data: ItemFormValues) => {
    if (mutation.isPending) return;
    // Client-side validation (no zodResolver needed — types are all strings)
    const validationErrors = validateForm(data, edit ? item?.barcode : undefined);
    if (Object.keys(validationErrors).length > 0) {
      Object.entries(validationErrors).forEach(([field, message]) => {
        setError(field as keyof ItemFormValues, { type: 'manual', message });
      });
      return;
    }
    mutation.mutate(data);
  };

  const handleConflictReload = () => {
    setConflictDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: catalogKeys.detail(id!) });
  };

  if (edit && isLoadingItem) {
    return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;
  }

  if (edit && itemError) {
    return <ErrorState message="Could not load item." onRetry={() => navigate('/catalog/items')} />;
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-4">
        <Link to={edit ? `/catalog/items/${id}` : "/catalog/items"} className="inline-flex items-center text-sm text-[#159A8A] hover:underline">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to {edit ? 'Item details' : 'Catalog'}
        </Link>
      </div>

      <PageHeader
        title={edit ? "Edit Catalog Item" : "New Catalog Item"}
        subtitle="Enter item details for the master catalog"
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <h3 className="col-span-full text-lg font-medium border-b pb-2">Basic Details</h3>

            <div className="col-span-full">
              <Input
                label="Item Name *"
                placeholder="e.g. Cherry Tomatoes 250g"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>

            <Input
              label="Item Code *"
              placeholder="e.g. TOM-CHE-250"
              error={errors.itemCode?.message}
              {...register('itemCode')}
            />

            <Input
              label="Barcode"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
              placeholder="Code 128 compatible value (Optional)"
              error={errors.barcode?.message}
              {...register('barcode')}
            />

            <h3 className="col-span-full text-lg font-medium border-b pb-2 mt-4">Classification</h3>

            <Select
              label="Category *"
              placeholder="Select Category"
              error={errors.categoryId?.message}
              {...register('categoryId')}
              options={categories?.map(c => ({ value: c.id, label: c.name })) || []}
            />

            <Select
              label="Type (Optional)"
              placeholder={!selectedCategoryId ? "Select a category first" : "Select Type"}
              error={errors.typeId?.message}
              {...register('typeId')}
              options={types?.map((t: { id: string; name: string }) => ({ value: t.id, label: t.name })) || []}
              disabled={!selectedCategoryId || !types?.length}
            />

            <h3 className="col-span-full text-lg font-medium border-b pb-2 mt-4">Inventory & Tracking</h3>

            <Select
              label="Default Unit *"
              error={errors.defaultUnit?.message}
              {...register('defaultUnit')}
              options={[
                { value: 'PCS', label: 'Pieces (PCS)' },
                { value: 'KG', label: 'Kilograms (KG)' },
                { value: 'BOX', label: 'Boxes (BOX)' }
              ]}
            />

            <Input
              label="Kg Per Unit"
              type="number"
              step="0.001"
              placeholder="Optional weight tracking"
              error={errors.kgPerUnit?.message}
              {...register('kgPerUnit')}
            />

            <Input
              label="Reorder Level"
              type="number"
              step="0.01"
              hint="Alert threshold for low stock"
              error={errors.reorderLevel?.message}
              {...register('reorderLevel')}
            />

            <div className="flex items-center gap-2 mt-7">
              <input
                type="checkbox"
                id="isActive"
                className="h-4 w-4 rounded border-gray-300 text-[#159A8A] focus:ring-[#159A8A]"
                {...register('isActive')}
              />
              <label htmlFor="isActive" className="text-sm font-medium text-[#0F172A]">
                Active (Available for POs)
              </label>
            </div>

          </div>
        </Card>

        <div className="flex justify-end gap-3 sticky bottom-4 bg-[#F7F9F6] p-4 rounded-xl border border-[#E2E8E6] shadow-sm">
          <Link to={edit ? `/catalog/items/${id}` : "/catalog/items"}>
            <Button type="button" variant="ghost" disabled={isSubmitting || mutation.isPending}>Cancel</Button>
          </Link>
          <Button type="submit" icon={<Save className="h-4 w-4" />} loading={isSubmitting || mutation.isPending}>
            {edit ? 'Save Changes' : 'Create Item'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={conflictDialogOpen}
        title="Version Conflict"
        description="This item was modified by another user while you were editing. Reload the latest version before saving your changes."
        confirmLabel="Reload Latest"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={handleConflictReload}
        onCancel={() => setConflictDialogOpen(false)}
      />
    </div>
  );
}
