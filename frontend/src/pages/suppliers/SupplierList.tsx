import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Package } from 'lucide-react';
import { catalogApi, type Supplier, type SupplierItem, type SupplierItemInput } from '../../api/catalogApi';
import { supplierKeys } from '../../lib/queryKeys';
import { PageHeader, Button, Card, Skeleton, ErrorState, ConfirmDialog, Modal, Input, Textarea, Badge } from '../../components/ui';
import { useToast } from '../../components/ui/toastContext';
import { CsvExportButton } from '../../components/CsvExportButton';
import { SupplierHistory } from '../../components/SupplierHistory';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../auth/hasPermission';

export default function SupplierList() {
  const user = useAuthStore(s => s.user);
  const [history, setHistory] = useState<Supplier | null>(null);
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [supplierIdToDelete, setSupplierIdToDelete] = useState<string | null>(null);
  const [supplierForItems, setSupplierForItems] = useState<Supplier | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...supplierKeys.lists(), search, page],
    queryFn: () => catalogApi.getSuppliers({ search, page, pageSize: 50 }),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<Supplier>) => {
      if (editingSupplier) return catalogApi.updateSupplier(editingSupplier.id, payload);
      return catalogApi.createSupplier(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      showToast(`Supplier ${editingSupplier ? 'updated' : 'created'}`);
      handleClose();
    },
    onError: (err: any) => {
      if (err.normalized === 'SUPPLIER_EXISTS') {
        setErrorMsg('Supplier name already exists.');
      } else {
        setErrorMsg('Failed to save supplier.');
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi.deleteSupplier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      showToast('Supplier deleted');
      setDeleteOpen(false);
    },
    onError: (err: any) => {
      showToast(err.normalized?.message || err.normalized === 'SUPPLIER_IN_USE' ? 'Cannot delete supplier that is in use.' : 'Failed to delete', 'error');
      setDeleteOpen(false);
    }
  });

  const handleOpenNew = () => {
    setEditingSupplier(null);
    setName('');
    setPhone('');
    setAddress('');
    setNotes('');
    setIsActive(true);
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setName(s.name);
    setPhone(s.phone || '');
    setAddress(s.address || '');
    setNotes(s.notes || '');
    setIsActive(s.isActive);
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleClose = () => setModalOpen(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Name is required');
      return;
    }
    saveMutation.mutate({ name, phone, address, notes, isActive });
  };

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Manage product suppliers"
        actions={
          hasPermission(user, 'supplier.create') && <Button icon={<Plus className="h-4 w-4" />} onClick={handleOpenNew}>New Supplier</Button>
        }
      />

      <div className="my-4 flex flex-wrap items-end gap-3">
        <Input label="Search suppliers" value={search} maxLength={200} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <Button variant="secondary" disabled={page === 1 || isLoading} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <span className="py-2 text-sm">Page {page}</span>
        <Button variant="secondary" disabled={isLoading || !data || data.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
      <Card className="overflow-x-auto">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-[#475569] font-medium border-b border-[#E2E8E6]">
              <tr>
                <th className="px-4 py-3">Supplier Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Linked Items</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8E6]">
              {data?.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[#0F172A]">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{s.linkedItemsCount}</td>
                  <td className="px-4 py-3">
                    {s.isActive ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {hasPermission(user, 'purchase.view') && <Button variant="ghost" size="sm" onClick={() => setHistory(s)}>History</Button>}
                    {s.isActive && <CsvExportButton kind="supplier" label="Purchase CSV" supplierId={s.id} />}
                    <Button variant="ghost" size="sm" aria-label={`Manage items for ${s.name}`} onClick={() => setSupplierForItems(s)}>
                      <Package className="h-4 w-4" />
                    </Button>
                    {hasPermission(user, 'supplier.edit') && <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(s)}>
                      <Edit className="h-4 w-4" />
                    </Button>}
                    {hasPermission(user, 'supplier.delete') && <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setSupplierIdToDelete(s.id); setDeleteOpen(true); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No suppliers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!history} title={`Purchase history · ${history?.name ?? ''}`} onClose={() => setHistory(null)}>{history && <SupplierHistory key={history.id} id={history.id} />}</Modal>
      <Modal
        open={modalOpen}
        onClose={handleClose}
        title={editingSupplier ? "Edit Supplier" : "New Supplier"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}

          <Input
            label="Supplier Name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <Input
            label="Phone Number"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <Textarea
            label="Address"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
          <Textarea
            label="Notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <div className="flex items-center gap-2 mt-4">
            <input
              type="checkbox"
              id="isActiveSupplier"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#159A8A]"
            />
            <label htmlFor="isActiveSupplier" className="text-sm font-medium">Active</label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Supplier"
        description="Are you sure you want to delete this supplier? This action cannot be undone."
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(supplierIdToDelete!)}
        onCancel={() => setDeleteOpen(false)}
      />

      <SupplierItemsDialog supplier={supplierForItems} onClose={() => setSupplierForItems(null)} />
    </div>
  );
}

function SupplierItemsDialog({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const user = useAuthStore(s => s.user);
  const canEdit = hasPermission(user, 'supplier.edit'), canCatalog = hasPermission(user, 'catalog.view');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [itemSearch, setItemSearch] = useState('');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [supplierItemCode, setSupplierItemCode] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const itemsQuery = useQuery({
    queryKey: ['supplier-items', supplier?.id],
    queryFn: () => catalogApi.getSupplierItems(supplier!.id),
    enabled: !!supplier,
  });
  const catalogQuery = useQuery({
    queryKey: ['supplier-item-picker', itemSearch],
    queryFn: () => catalogApi.getItems(1, 50, itemSearch),
    enabled: !!supplier && canEdit && canCatalog,
  });

  const refresh = () => {
    if (!supplier) return;
    void queryClient.invalidateQueries({ queryKey: ['supplier-items', supplier.id] });
    void queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
  };
  const addMutation = useMutation({
    mutationFn: (input: SupplierItemInput) => catalogApi.addSupplierItem(supplier!.id, input),
    onSuccess: () => {
      refresh();
      setCatalogItemId(''); setSupplierItemCode(''); setIsDefault(false); setNotes(''); setFormError('');
      showToast('Item linked to supplier');
    },
    onError: (err: any) => setFormError(err.normalized === 'SUPPLIER_ITEM_EXISTS' ? 'This item is already linked.' : 'Could not link item.'),
  });
  const updateMutation = useMutation({
    mutationFn: ({ link, input }: { link: SupplierItem; input: SupplierItemInput }) => catalogApi.updateSupplierItem(supplier!.id, link.id, input),
    onSuccess: () => { refresh(); showToast('Supplier item updated'); },
    onError: () => showToast('Could not update supplier item', 'error'),
  });
  const removeMutation = useMutation({
    mutationFn: (link: SupplierItem) => catalogApi.removeSupplierItem(supplier!.id, link.id),
    onSuccess: () => { refresh(); showToast('Item unlinked from supplier'); },
    onError: () => showToast('Could not remove supplier item', 'error'),
  });

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    if (!catalogItemId) { setFormError('Choose an item to link.'); return; }
    addMutation.mutate({ catalogItemId, supplierItemCode, isDefault, notes });
  };

  return (
    <Modal open={!!supplier} onClose={onClose} title={supplier ? `Items supplied by ${supplier.name}` : ''}>
      <div className="space-y-5">
        {canEdit && canCatalog && <form onSubmit={handleAdd} className="space-y-3 rounded border border-[#E2E8E6] p-3">
          <h3 className="font-medium">Link a catalog item</h3>
          <Input label="Find item" value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Search by name or item code" />
          <label className="block text-sm font-medium text-gray-700">Catalog item
            <select aria-label="Catalog item" className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" value={catalogItemId} onChange={e => setCatalogItemId(e.target.value)}>
              <option value="">Select an item</option>
              {catalogQuery.data?.data.map(item => <option key={item.id} value={item.id}>{item.name} ({item.itemCode})</option>)}
            </select>
          </label>
          <Input label="Supplier item code" value={supplierItemCode} onChange={e => setSupplierItemCode(e.target.value)} maxLength={128} />
          <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} /> Preferred supplier for this item</label>
          {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
          {catalogQuery.isError && <p role="alert" className="text-sm text-red-700">Could not load catalog items.</p>}
          <Button type="submit" loading={addMutation.isPending}>Link item</Button>
        </form>}

        <section aria-label="Linked items" className="space-y-2">
          <h3 className="font-medium">Linked items</h3>
          {itemsQuery.isLoading ? <Skeleton className="h-12 w-full" /> : itemsQuery.isError ? <ErrorState onRetry={() => void itemsQuery.refetch()} /> : (
            <div className="space-y-2">
              {itemsQuery.data?.map(link => <SupplierItemRow key={link.id} link={link}
                saving={updateMutation.isPending} removing={removeMutation.isPending} canEdit={canEdit}
                onSave={input => updateMutation.mutate({ link, input })}
                onRemove={() => removeMutation.mutate(link)} />)}
              {itemsQuery.data?.length === 0 && <p className="text-sm text-gray-500">No linked items yet.</p>}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function SupplierItemRow({ link, saving, removing, onSave, onRemove, canEdit }: {
  link: SupplierItem; saving: boolean; removing: boolean; canEdit: boolean;
  onSave: (input: SupplierItemInput) => void; onRemove: () => void;
}) {
  const [supplierItemCode, setSupplierItemCode] = useState(link.supplierItemCode ?? '');
  const [isDefault, setIsDefault] = useState(link.isDefault);
  const [notes, setNotes] = useState(link.notes ?? '');
  const changed = supplierItemCode !== (link.supplierItemCode ?? '') || isDefault !== link.isDefault || notes !== (link.notes ?? '');
  return (
    <fieldset disabled={!canEdit} className="rounded border border-[#E2E8E6] p-3 space-y-2">
      <div className="font-medium">{link.itemName} <span className="text-gray-500 font-normal">({link.itemCode})</span></div>
      <Input aria-label={`Supplier item code for ${link.itemName}`} label="Supplier item code" value={supplierItemCode} maxLength={128} onChange={e => setSupplierItemCode(e.target.value)} />
      <Textarea aria-label={`Notes for ${link.itemName}`} label="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} /> Preferred supplier for this item</label>
      {canEdit && <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="text-red-600" disabled={removing} onClick={onRemove}><Trash2 className="h-4 w-4" /> Unlink</Button>
        <Button size="sm" disabled={!changed} loading={saving} onClick={() => onSave({ catalogItemId: link.catalogItemId, supplierItemCode, isDefault, notes })}>Save</Button>
      </div>}
    </fieldset>
  );
}
