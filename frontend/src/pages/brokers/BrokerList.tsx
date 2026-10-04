import { SafeImage } from '../../components/SafeImage';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { catalogApi, type Broker } from '../../api/catalogApi';
import { brokerKeys } from '../../lib/queryKeys';
import { PageHeader, Button, Card, Skeleton, ErrorState, ConfirmDialog, Modal, Input, Badge } from '../../components/ui';
import { useToast } from '../../components/ui/toastContext';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../auth/hasPermission';

export default function BrokerList() {
  const user = useAuthStore(s => s.user);
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [brokerIdToDelete, setBrokerIdToDelete] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...brokerKeys.lists(), search, page],
    queryFn: () => catalogApi.getBrokers({ search, page, pageSize: 50 }),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<Broker>) => {
      if (editingBroker) return catalogApi.updateBroker(editingBroker.id, payload);
      return catalogApi.createBroker(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brokerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      showToast(`Broker ${editingBroker ? 'updated' : 'created'}`);
      handleClose();
    },
    onError: (err: any) => {
      if (err.normalized === 'BROKER_EXISTS') {
        setErrorMsg('Broker name already exists.');
      } else {
        setErrorMsg('Failed to save broker.');
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi.deleteBroker(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brokerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      showToast('Broker deleted');
      setDeleteOpen(false);
    },
    onError: (err: any) => {
      showToast(err.normalized?.message || err.normalized === 'BROKER_IN_USE' ? 'Cannot delete broker that is linked to suppliers.' : 'Failed to delete', 'error');
      setDeleteOpen(false);
    }
  });

  const handleOpenNew = () => {
    setEditingBroker(null);
    setName(''); setImageUrl('');
    setIsActive(true);
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleOpenEdit = (b: Broker) => {
    setEditingBroker(b);
    setName(b.name); setImageUrl(b.imageUrl ?? '');
    setIsActive(b.isActive);
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
    saveMutation.mutate({ name, isActive, imageUrl: imageUrl || undefined });
  };

  return (
    <div>
      <PageHeader
        title="Brokers"
        subtitle="Manage purchasing brokers and intermediaries"
        actions={
          hasPermission(user, 'broker.create') && <Button icon={<Plus className="h-4 w-4" />} onClick={handleOpenNew}>New Broker</Button>
        }
      />

      <div className="my-4 flex flex-wrap items-end gap-3">
        <Input label="Search brokers" value={search} maxLength={200} onChange={e => { setSearch(e.target.value); setPage(1); }} />
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
                <th className="px-4 py-3">Broker Name</th>
                <th className="px-4 py-3 text-right">Linked Suppliers</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8E6]">
              {data?.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[#0F172A]">{b.name}<SafeImage src={b.imageUrl} alt={b.name} /></td>
                  <td className="px-4 py-3 text-right text-gray-500">{b.linkedSuppliersCount}</td>
                  <td className="px-4 py-3">
                    {b.isActive ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {hasPermission(user, 'broker.edit') && <Button variant="ghost" size="sm" aria-label={`Edit ${b.name}`} onClick={() => handleOpenEdit(b)}>
                      <Edit className="h-4 w-4" />
                    </Button>}
                    {hasPermission(user, 'broker.delete') && <Button variant="ghost" size="sm" aria-label={`Delete ${b.name}`} className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setBrokerIdToDelete(b.id); setDeleteOpen(true); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No brokers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={handleClose}
        title={editingBroker ? "Edit Broker" : "New Broker"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}

          <Input label="Image URL (HTTPS)" type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
          <Input
            label="Broker Name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <div className="flex items-center gap-2 mt-4">
            <input
              type="checkbox"
              id="isActiveBroker"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#159A8A]"
            />
            <label htmlFor="isActiveBroker" className="text-sm font-medium">Active</label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Broker"
        description="Are you sure you want to delete this broker? This action cannot be undone."
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(brokerIdToDelete!)}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
