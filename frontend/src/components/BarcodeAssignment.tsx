import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { catalogApi, type CatalogItem } from '../api/catalogApi';
import { useAuthStore } from '../stores/authStore';
import { hasPermission } from '../auth/hasPermission';
import { barcodeError, barcodeValidation, invalidateBarcodeQueries } from '../lib/barcodes';
import { Button, Input } from './ui';

export default function BarcodeAssignment({ item, onChanged }: { item: CatalogItem; onChanged?: (item: CatalogItem) => void }) {
  const client = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [draft, setDraft] = useState({ id: item.id, version: item.rowVersion, value: item.barcode || '' });
  const value = draft.id === item.id && draft.version === item.rowVersion ? draft.value : item.barcode || '';
  const setValue = (value: string) => setDraft({ id: item.id, version: item.rowVersion, value });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  if (!hasPermission(user, 'catalog.edit')) return null;
  const save = async (operation: 'save' | 'generate' | 'clear' | 'reload') => {
    if (busy.current) return;
    setError(''); setSuccess('');
    const invalid = operation === 'save' ? barcodeValidation(value) : undefined;
    if (invalid) { setError(invalid); return; }
    busy.current = true; setPending(true);
    try {
      const updated = operation === 'reload' ? await catalogApi.getItemById(item.id)
        : operation === 'generate' ? await catalogApi.generateBarcode(item.id, item.rowVersion)
        : await catalogApi.assignBarcode(item.id, operation === 'clear' ? null : value.trim() || null, item.rowVersion);
      onChanged?.({ ...item, ...updated });
      setValue(updated.barcode || '');
      await invalidateBarcodeQueries(client);
      setSuccess(operation === 'reload' ? 'Latest item loaded.' : 'Barcode saved. Stock is unchanged.');
    } catch (err) { setError(barcodeError(err)); }
    finally { busy.current = false; setPending(false); }
  };
  return <section className="space-y-3 min-w-0" aria-label="Item barcode assignment">
    <h3 className="font-semibold">Barcode for {item.name}</h3>
    {item.barcode && <p className="text-sm break-all">Current barcode: {item.barcode}</p>}
    {!item.isActive && <p role="status">Archived item. Its barcode remains reserved.</p>}
    <Input label="New Barcode" value={value} maxLength={100} disabled={pending} error={error}
      onChange={e => { setValue(e.target.value); setError(''); setSuccess(''); }}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (value.trim()) void save('save'); } }} />
    {success && <p role="status">{success}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={pending || !value.trim()} loading={pending} onClick={() => void save('save')}>Save Barcode</Button>
      {!item.barcode && item.isActive && <Button type="button" variant="secondary" disabled={pending} onClick={() => void save('generate')}>Generate Barcode</Button>}
      {item.barcode && <Button type="button" variant="secondary" disabled={pending} onClick={() => void save('clear')}>Clear Barcode</Button>}
      <Button type="button" variant="ghost" disabled={pending} onClick={() => void save('reload')}>Reload Item</Button>
    </div>
    <p className="text-sm">Codes are case-sensitive. Clearing releases this code for reassignment. Generated codes use Code 128.</p>
  </section>;
}
