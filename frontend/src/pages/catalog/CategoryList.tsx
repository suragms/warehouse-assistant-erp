import { ResponsiveRecords, RecordCard, RecordFields, DataTableScroll } from '../../components/ui/ResponsiveRecords';
import { PermissionGate } from '../../auth/Guards';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { catalogApi, type Category } from '../../api/catalogApi';
import { categoryKeys } from '../../lib/queryKeys';
import { PageHeader, Button, Card, Skeleton, ErrorState, ConfirmDialog, Modal, Input } from '../../components/ui';
import { useToast } from '../../components/ui/toastContext';

export default function CategoryList() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [categoryIdToDelete, setCategoryIdToDelete] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: categoryKeys.lists(),
    queryFn: () => catalogApi.getCategories(),
  });

  const saveMutation = useMutation({
    mutationFn: (val: string) => {
      if (editingCategory) return catalogApi.updateCategory(editingCategory.id, val);
      return catalogApi.createCategory(val);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      showToast(`Category ${editingCategory ? 'updated' : 'created'}`);
      handleClose();
    },
    onError: (err: { normalized?: string | { message?: string } }) => {
      if (err.normalized === 'CATEGORY_EXISTS') {
        setErrorMsg('Category name already exists.');
      } else {
        setErrorMsg('Failed to save category.');
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      showToast('Category deleted');
      setDeleteOpen(false);
    },
    onError: (err: { normalized?: string | { message?: string } }) => {
      const msg = typeof err.normalized === 'string' ? err.normalized : err.normalized?.message;
      showToast(msg === 'CATEGORY_IN_USE' ? 'Cannot delete category that contains items.' : (msg || 'Failed to delete'), 'error');
      setDeleteOpen(false);
    }
  });

  const handleOpenNew = () => {
    setEditingCategory(null);
    setName('');
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleOpenEdit = (c: Category) => {
    setEditingCategory(c);
    setName(c.name);
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    setEditingCategory(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Name is required');
      return;
    }
    saveMutation.mutate(name);
  };

  const recordActions = (c: Category) => <div className="flex flex-wrap items-center justify-end gap-2">
<PermissionGate permission="catalog.edit"><Button aria-label={`Edit ${c.name}`} variant="ghost" size="sm" onClick={() => handleOpenEdit(c)}>
                      <Edit className="h-4 w-4" />
                    </Button></PermissionGate>
                    <PermissionGate permission="catalog.archive"><Button aria-label={`Delete ${c.name}`} variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setCategoryIdToDelete(c.id); setDeleteOpen(true); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button></PermissionGate>
  </div>;

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Manage product categories"
        actions={
          <PermissionGate permission="catalog.create"><Button icon={<Plus className="h-4 w-4" />} onClick={handleOpenNew}>New Category</Button></PermissionGate>
        }
      />

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <ResponsiveRecords label="Categories" mobile={<div className="space-y-3">{data?.map(c => <RecordCard key={c.id} title={c.name} actions={recordActions(c)}>
                <RecordFields fields={[{ label: 'Items', value: c.itemCount }]} />
              </RecordCard>)}{data?.length === 0 && <p className="p-4 text-center text-sm text-gray-500">No categories found.</p>}</div>}>
            <DataTableScroll label="Categories table" minWidth="30rem">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-[#475569] font-medium border-b border-[#E2E8E6]">
              <tr>
                <th className="px-4 py-3">Category Name</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8E6]">
              {data?.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[#0F172A]">{c.name}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{c.itemCount}</td>
                  <td className="px-4 py-3 text-right space-x-2">{recordActions(c)}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    No categories found.
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
        title={editingCategory ? "Edit Category" : "New Category"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Category Name"
            value={name}
            onChange={e => setName(e.target.value)}
            error={errorMsg}
            autoFocus
          />
          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Category"
        description="Are you sure you want to delete this category? This cannot be undone."
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(categoryIdToDelete!)}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
