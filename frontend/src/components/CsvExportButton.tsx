import { useState } from 'react';
import { canExport, downloadCsv, type CsvKind } from '../api/exportsApi';
import { useAuthStore } from '../stores/authStore';
import { hasPermission } from '../auth/hasPermission';

export function CsvExportButton({ kind, label, params, supplierId }: { kind: CsvKind; label: string; params?: { search?: string; filter?: string; start?: string; end?: string; categoryId?: string; supplierId?: string; severity?: string }; supplierId?: string }) {
  const user = useAuthStore(s => s.user); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const financial = kind !== 'stock' && kind !== 'low-stock';
  if (!canExport() || (financial && !['Owner', 'SuperAdmin'].includes(user?.currentBusiness?.role ?? ''))
    || (!financial && !hasPermission(user, 'stock.view')) || (kind === 'supplier' && (!hasPermission(user, 'supplier.view') || !hasPermission(user, 'purchase.view')))) return null;
  return <span className="inline-flex flex-col max-w-full align-top"><button title="Downloads use saved records. Unknown historical values are left blank." className="border rounded px-3 py-3 min-h-12 text-sm bg-white disabled:opacity-50" disabled={busy} onClick={async () => {
    if (busy) return; setBusy(true); setError(''); try { await downloadCsv(kind, params, supplierId); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>{busy ? 'Preparing CSV…' : label}</button>{error && <span role="alert" className="text-red-700 text-sm break-words">{error}</span>}</span>;
}
