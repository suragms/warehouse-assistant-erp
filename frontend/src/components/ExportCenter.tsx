import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reportExportsApi, utcReportPeriod } from '../api/reportExportsApi';
import { mlApi } from '../api/mlApi';
import { backupDeviceKey, canExport } from '../api/exportsApi';
import { hasPermission } from '../auth/hasPermission';
import { useAuthStore } from '../stores/authStore';

const field = 'block w-full min-w-0 border rounded p-3 mt-1 bg-white';
export default function ExportCenter() {
  const user = useAuthStore(s => s.user), scope = backupDeviceKey() + ':' + JSON.stringify([user?.currentBusiness?.role, [...(user?.currentBusiness?.permissions ?? [])].sort()]), allowed = canExport(), cache = useQueryClient();
  const [category, setCategory] = useState('all'), [reportId, setReportId] = useState(''), [format, setFormat] = useState('pdf'), [status, setStatus] = useState('all');
  const [start, setStart] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)), [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [itemId, setItemId] = useState(''), [search, setSearch] = useState(''), [itemPage, setItemPage] = useState(1), [horizon, setHorizon] = useState('7');
  const [notice, setNotice] = useState('');
  const catalog = useQuery({ queryKey: ['exports', scope, 'reports'], queryFn: reportExportsApi.catalog, enabled: allowed, retry: false });
  const history = useQuery({ queryKey: ['exports', scope, 'history'], queryFn: reportExportsApi.history, enabled: allowed, retry: false });
  const choices = (catalog.data?.reports ?? []).filter(r => category === 'all' || r.category === category);
  const selected = choices.find(r => r.id === reportId) ?? choices[0];
  const items = useQuery({ queryKey: ['exports', scope, 'forecast-items', search, itemPage], queryFn: () => mlApi.items(search, itemPage), enabled: allowed && selected?.itemRequired === true, retry: false });
  const download = useMutation({ mutationFn: async () => {
    if (!selected) throw new Error('Select an available report.');
    const params: Record<string, unknown> = { status };
    if (selected.period) Object.assign(params, utcReportPeriod(start, end));
    if (selected.itemRequired) { if (!itemId) throw new Error('Select a forecast item.'); params.itemId = itemId; params.horizon = Number(horizon); }
    await reportExportsApi.download(selected.id, format, params);
    return selected.title;
  }, onSuccess: title => { setNotice(`${title}: download started. Use the PDF viewer to print a PDF.`); void cache.invalidateQueries({ queryKey: ['exports', scope, 'history'] }); } });
  if (!allowed) return null;
  return <section className="rounded-xl border bg-white p-4 space-y-4 min-w-0" aria-labelledby="export-center-title">
    <h2 id="export-center-title" className="text-lg font-semibold">Export Center</h2>
    <p>Download one report at a time. Reports use saved records and server calculations. Dates and reporting boundaries use UTC.</p>
    {catalog.isPending && <p role="status">Loading available reports…</p>}
    {catalog.isError && <p role="alert">Available reports could not be loaded. <button className="underline min-h-12" onClick={() => void catalog.refetch()}>Retry reports</button></p>}
    {catalog.data && !catalog.data.reports.length && <p>No reports are available with your current permissions.</p>}
    {selected && <form onSubmit={e => { e.preventDefault(); if (!download.isPending) { setNotice(''); download.mutate(); } }} className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <label>Report category<select className={field} value={category} disabled={download.isPending} onChange={e => { setCategory(e.target.value); setReportId(''); setStatus('all'); setNotice(''); }}><option value="all">All categories</option>{[...new Set(catalog.data?.reports.map(r => r.category))].map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Report<select className={field} value={selected.id} disabled={download.isPending} onChange={e => { setReportId(e.target.value); setStatus('all'); setNotice(''); download.reset(); }}>{choices.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
        <label>Export format<select className={field} value={format} disabled={download.isPending} onChange={e => setFormat(e.target.value)}>{selected.formats.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select></label>
        <label>From date (UTC)<input type="date" className={field} value={start} onChange={e => setStart(e.target.value)} required={selected.period} disabled={!selected.period || download.isPending} /></label>
        <label>Through date (UTC)<input type="date" className={field} value={end} min={start} onChange={e => setEnd(e.target.value)} required={selected.period} disabled={!selected.period || download.isPending} /></label>
        <label>Report status<select className={field} value={status} disabled={selected.statusFilter === 'none' || download.isPending} onChange={e => setStatus(e.target.value)}><option value="all">All eligible records</option>{selected.statusFilter === 'active' && <><option value="active">Active</option><option value="inactive">Inactive</option></>}{selected.statusFilter === 'purchase' && (selected.id === 'delivery' ? ['Draft', 'Confirmed', 'Dispatched', 'Arrived', 'Verified', 'Completed', 'Cancelled'] : ['Confirmed', 'Dispatched', 'Arrived', 'Verified', 'Completed']).map(s => <option key={s}>{s}</option>)}</select></label>
      </div>
      {!selected.period && <p className="text-sm">This report shows a current snapshot. Date filters do not apply.</p>}
      {selected.itemRequired && <div className="space-y-3">
        <label>Find forecast item<input className={field} maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setItemPage(1); setItemId(''); }} /></label>
        {items.isPending && <p role="status">Loading forecast items…</p>}{items.isError && <p role="alert">Forecast items could not be loaded. <button type="button" className="underline min-h-12" onClick={() => void items.refetch()}>Retry items</button></p>}
        <label>Forecast item<select className={field} required value={itemId} onChange={e => setItemId(e.target.value)}><option value="">Select an item</option>{items.data?.items.map(i => <option key={i.id} value={i.id}>{i.name} · {i.itemCode} · {i.unit}</option>)}</select></label>
        {items.data?.items.length === 0 && <p>No matching items.</p>}
        <div className="flex gap-3"><button type="button" disabled={itemPage === 1} onClick={() => { setItemPage(p => p - 1); setItemId(''); }}>Previous items</button><button type="button" disabled={!items.data || itemPage * 50 >= items.data.totalCount} onClick={() => { setItemPage(p => p + 1); setItemId(''); }}>Next items</button></div>
        <label>Forecast horizon<select className={field} value={horizon} onChange={e => setHorizon(e.target.value)}>{[7, 14, 30].map(n => <option key={n} value={n}>{n} days</option>)}</select></label>
        <p className="text-sm">A compatible trained model must be ready. Predictions are uncertain; unavailable models do not produce substitute reports.</p>
      </div>}
      <button type="submit" disabled={download.isPending || (selected.itemRequired && !itemId)} className="px-4 py-3 rounded bg-emerald-800 text-white disabled:opacity-50">{download.isPending ? 'Preparing report…' : `Download ${selected.title} ${format.toUpperCase()}`}</button>
    </form>}
    {download.isPending && <p role="status">Preparing report…</p>}{notice && <p role="status" className="text-emerald-800">{notice}</p>}{download.isError && <p role="alert" className="text-red-700">{download.error.message}</p>}
    {hasPermission(user, 'catalog.view') && <p><Link className="underline inline-block py-3" to="/catalog/items">Print individual or batch barcode labels from Items</Link> · <Link className="underline inline-block py-3" to="/catalog/barcodes">Find and reprint a barcode label</Link>. Use browser Print or Save as PDF.</p>}
    {catalog.data && <details><summary className="cursor-pointer py-3">Report scope and unavailable data</summary><ul className="list-disc pl-5 space-y-2">{catalog.data.missingCapabilities.map(note => <li key={note}>{note}</li>)}</ul><p className="mt-3">Large downloads are bounded to {catalog.data.maxRows.toLocaleString()} rows (purchase reports: 2,000 orders and 5,000 lines). Narrow the filters when prompted.</p></details>}
    <h3 className="font-semibold">Recent report exports</h3><p className="text-sm">Your latest 50 generated reports in this business. “Generated” confirms server creation; browser saving and printing happen on your device.</p>
    {history.isPending && <p role="status">Loading report history…</p>}{history.isError && <p role="alert">Report history could not be loaded. <button className="underline py-3" onClick={() => void history.refetch()}>Retry report history</button></p>}
    {history.data?.items.length === 0 && <p>No report exports recorded yet.</p>}
    <ol className="space-y-2">{history.data?.items.map(entry => <li key={entry.id} className="border rounded p-3 break-words">{catalog.data?.reports.find(r => r.id === entry.details.report)?.title ?? entry.details.report} · {entry.details.format.toUpperCase()} · {entry.details.rowCount} records · Generated · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(undefined, { timeZone: 'UTC' }) + ' UTC'}</time></li>)}</ol>
  </section>;
}
