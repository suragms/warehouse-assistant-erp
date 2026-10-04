import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/apiClient';
import { useAuthStore } from '../stores/authStore';

interface Preview { totalRows: number; validRows: number; errorCount: number; errors: { row: number; message: string }[]; sample: { row: number; itemId: string; date: string; quantity: number; unit: string }[]; canCommit: boolean; previewToken: string | null }
export default function HistoricalConsumptionImport() {
  const user = useAuthStore(s => s.user); const business = user?.currentBusiness?.businessId;
  const [csv, setCsv] = useState(''); const [source, setSource] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null); const [previewBusiness, setPreviewBusiness] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [summary, setSummary] = useState(''); const cache = useQueryClient();
  const reset = () => { setPreview(null); setError(''); setSummary(''); };
  const submit = async (commit: boolean) => {
    setBusy(true); setError(''); setSummary('');
    try {
      const response = await apiClient.post(`/ml/history/${commit ? 'commit' : 'preview'}`, { csv, source, confirmCompleteDailyTotals: confirmed, previewToken: commit ? preview?.previewToken : null });
      if (commit) { setSummary(`Imported ${response.data.importedRows} daily consumption records. Current stock was not changed.`); setPreview(null); await cache.invalidateQueries({ queryKey: ['ml-analysis', business] }); }
      else { setPreview(response.data); setPreviewBusiness(business ?? ''); }
    } catch { setError(commit ? 'The import result could not be confirmed. Preview again; completed imports are detected and cannot be repeated.' : 'Preview failed. Check the CSV format, source, permissions and connection.'); setPreview(null); }
    finally { setBusy(false); }
  };
  if (!['Owner', 'SuperAdmin'].includes(user?.currentBusiness?.role ?? '')) return null;
  return <details className="bg-white border rounded-xl p-4 space-y-3">
    <summary className="font-semibold cursor-pointer">Import historical consumption</summary>
    <p className="text-sm">Import complete daily totals from a trusted source. Purchases, stock corrections and snapshots are not consumption. Import does not change current stock.</p>
    <p className="text-sm">CSV only, up to 2 MB / 5,000 rows / 100 items. Use completed UTC dates, exact saved item units and the original recording timestamp on each date. Keep zeros explicit; do not fill missing days with zero.</p>
    <p className="text-sm break-all">Columns: business_id,warehouse_id,item_id,date,quantity,unit,transaction_type,recorded_at. Both business and warehouse must be <strong>{business}</strong>. Transaction type: consumption_daily_total. Date: yyyy-MM-dd. Timestamp: yyyy-MM-ddTHH:mm:ssZ.</p>
    <label className="block text-sm">Consumption CSV<input type="file" accept=".csv,text/csv" disabled={busy} className="block w-full mt-1" onChange={async e => {
      reset(); setCsv(''); const file = e.target.files?.[0]; if (!file) return;
      if (file.size > 2_000_000 || !file.name.toLowerCase().endsWith('.csv')) { setError('Choose a CSV file of at most 2 MB.'); return; }
      try { setCsv(await file.text()); } catch { setError('The file could not be read.'); }
    }} /></label>
    <label className="block text-sm">Trusted source description<input maxLength={200} disabled={busy} className="block border rounded p-2 w-full mt-1" value={source} onChange={e => { reset(); setSource(e.target.value); }} /></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => { reset(); setConfirmed(e.target.checked); }} />I have verified complete daily consumption totals and their original source timestamps.</label>
    <button className="border rounded px-3 py-2" disabled={busy || !csv || !source.trim() || !confirmed} onClick={() => void submit(false)}>{busy ? 'Checking…' : 'Preview consumption import'}</button>
    {error && <p role="alert">{error}</p>}{summary && <p role="status">{summary}</p>}
    {preview && previewBusiness === business && <div className="space-y-2 text-sm"><p role="status">{preview.validRows}/{preview.totalRows} valid rows. {preview.errorCount} validation errors.</p>
      {preview.errors.length > 0 && <ul className="max-h-60 overflow-auto">{preview.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul>}
      <p>First {preview.sample.length} normalized rows:</p><div className="overflow-x-auto max-h-60"><table className="text-left w-full"><thead><tr><th>Row</th><th>Item</th><th>Date</th><th>Quantity</th></tr></thead><tbody>{preview.sample.map(r => <tr key={r.row}><td>{r.row}</td><td className="break-all">{r.itemId}</td><td className="whitespace-nowrap">{r.date}</td><td>{r.quantity} {r.unit}</td></tr>)}</tbody></table></div>
      <button className="border rounded px-3 py-2" disabled={busy || !preview.canCommit || !preview.previewToken} onClick={() => void submit(true)}>Confirm historical import</button>
    </div>}
  </details>;
}
