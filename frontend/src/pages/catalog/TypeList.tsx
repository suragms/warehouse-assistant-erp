import { ResponsiveRecords, RecordCard, RecordFields, DataTableScroll } from '../../components/ui/ResponsiveRecords';
import { hasPermission } from '../../auth/hasPermission';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { catalogApi, type CategoryType } from '../../api/catalogApi';
import { categoryKeys, typeKeys, catalogKeys } from '../../lib/queryKeys';
import { PageHeader, Button, Card, Skeleton, ErrorState, ConfirmDialog, Modal, Input, Select, EmptyState } from '../../components/ui';
import { useToast } from '../../components/ui/toastContext';
import { useAuthStore } from '../../stores/authStore';

type FormData = {
  categoryId: string;
  name: string;
};

export default function TypeList() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuthStore();

  const canCreate = hasPermission(user, 'catalog.create');
  const canEdit = hasPermission(user, 'catalog.edit');
  const canDelete = hasPermission(user, 'catalog.archive');

  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<CategoryType | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<{ id: string, categoryId: string } | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      categoryId: '',
      name: '',
    }
  });

  const { data: categories, isLoading: isLoadingCategories, error: categoriesError, refetch: retryCategories } = useQuery({
    queryKey: categoryKeys.lists(),
    queryFn: () => catalogApi.getCategories(),
  });

  const { data: types, isLoading: isLoadingTypes, error: typesError, refetch: refetchTypes } = useQuery({
    queryKey: typeKeys.byCategory(selectedCategoryId),
    queryFn: () => catalogApi.getTypesByCategory(selectedCategoryId),
    enabled: !!selectedCategoryId,
  });

  const filteredTypes = useMemo(() => {
    if (!types) return [];
    if (!search.trim()) return types;
    const lower = search.toLowerCase();
    return types.filter(t => t.name.toLowerCase().includes(lower));
  }, [types, search]);

  const saveMutation = useMutation({
    mutationFn: (val: FormData) => {
      if (editingType) {
        return catalogApi.updateType(val.categoryId, editingType.id, val.name);
      }
      return catalogApi.createType(val.categoryId, val.name);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: typeKeys.byCategory(variables.categoryId) });
      showToast(`Type ${editingType ? 'updated' : 'created'}`);
      handleClose();
    },
    onError: (err: { normalized?: string | { message?: string } }) => {
      if (err.normalized === 'CATEGORY_TYPE_EXISTS') {
        setErrorMsg('A type with this name already exists in this category');
      } else {
        setErrorMsg('Failed to save type.');
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { categoryId: string, id: string }) => catalogApi.deleteType(input.categoryId, input.id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: typeKeys.byCategory(variables.categoryId) });
      queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      showToast('Type deleted');
      setDeleteOpen(false);
    },
    onError: (err: { normalized?: string | { message?: string } }) => {
      const msg = typeof err.normalized === 'string' ? err.normalized : err.normalized?.message;
      if (msg === 'CATEGORY_TYPE_IN_USE') {
        showToast('This type cannot be removed because catalog items are using it', 'error');
      } else {
        showToast(msg || 'Failed to delete', 'error');
      }
      setDeleteOpen(false);
    }
  });

  const handleOpenNew = () => {
    setEditingType(null);
    reset({
      categoryId: selectedCategoryId || (categories?.[0]?.id ?? ''),
      name: '',
    });
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleOpenEdit = (t: CategoryType) => {
    setEditingType(t);
    reset({
      categoryId: t.categoryId,
      name: t.name,
    });
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    setEditingType(null);
  };

  const handleSave = (data: FormData) => {
    setErrorMsg('');
    saveMutation.mutate(data);
  };

  const categoryOptions = categories?.map(c => ({ value: c.id, label: c.name })) || [];

  const recordActions = (t: CategoryType) => <div className="flex flex-wrap items-center justify-end gap-2">
{canEdit && (
                      <Button variant="ghost" size="sm" aria-label={`Edit ${t.name}`} onClick={() => handleOpenEdit(t)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="sm" aria-label={`Delete ${t.name}`} className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setTypeToDelete({ id: t.id, categoryId: t.categoryId }); setDeleteOpen(true); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
  </div>;

  return (
    <div>
      <PageHeader
        title="Category Types"
        subtitle="Manage available types for a specific category"
        actions={
          canCreate ? (
             <Button icon={<Plus className="h-4 w-4" />} onClick={handleOpenNew}>New Type</Button>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-64">
          <Select
            aria-label="Filter category" value={selectedCategoryId}
            onChange={e => {
              setSelectedCategoryId(e.target.value);
              setSearch('');
            }}
            options={categoryOptions}
            placeholder="Select a category"
            disabled={isLoadingCategories}
          />
        </div>
        {selectedCategoryId && (
          <div className="w-full sm:w-64">
            <Input
              aria-label="Search types" placeholder="Search types..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {categoriesError && <ErrorState message="Categories could not be loaded." onRetry={() => void retryCategories()} />}
      <Card className="overflow-hidden">
        {!selectedCategoryId ? (
          <EmptyState
            title="No Category Selected"
            description="Select a category to view its types."
          />
        ) : isLoadingTypes ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : typesError ? (
          <ErrorState onRetry={() => refetchTypes()} />
        ) : (
          <ResponsiveRecords label="Category types" mobile={<div className="space-y-3">{filteredTypes.map(t => <RecordCard key={t.id} title={t.name} subtitle={t.categoryName} actions={recordActions(t)}>
                <RecordFields fields={[{ label: 'Items', value: t.itemCount }]} />
              </RecordCard>)}{filteredTypes.length === 0 && <p className="p-4 text-center text-sm text-gray-500">{search ? 'No types match your search.' : 'No types found in this category.'}</p>}</div>}>
            <DataTableScroll label="Category types table" minWidth="36rem">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-[#475569] font-medium border-b border-[#E2E8E6]">
              <tr>
                <th className="px-4 py-3">Type Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8E6]">
              {filteredTypes.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[#0F172A]">{t.name}</td>
                  <td className="px-4 py-3 text-[#475569]">{t.categoryName}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{t.itemCount}</td>
                  <td className="px-4 py-3 text-right space-x-2">{recordActions(t)}
                  </td>
                </tr>
              ))}
              {filteredTypes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    {search ? 'No types match your search.' : 'No types found in this category.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
            </DataTableScroll>
          </ResponsiveRecords>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={handleClose}
        title={editingType ? "Edit Type" : "New Type"}
      >
        <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
          <Select
            label="Category"
            options={categoryOptions}
            disabled={!!editingType}
            error={errors.categoryId?.message}
            {...register('categoryId', { required: 'Category is required' })}
          />
          <Input
            label="Type Name"
            error={errors.name?.message || errorMsg}
            maxLength={50}
            autoFocus
            {...register('name', { required: 'Name is required' })}
          />
          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Type"
        description="Are you sure you want to delete this type? This cannot be undone."
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => typeToDelete && deleteMutation.mutate(typeToDelete)}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
