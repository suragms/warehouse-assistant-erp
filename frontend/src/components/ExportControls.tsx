import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadServerFile, utcReportPeriod } from '../api/reportExportsApi';
import { canExport } from '../api/exportsApi';
import { purchaseErrorMessage } from '../lib/purchaseValidation';
import { CsvExportButton } from './CsvExportButton';
export function ExportControls({ start, end }: { start: string; end: string }) {
 const [busy, setBusy] = useState(''); const [error, setError] = useState('');
 async function download(file: string) { if (busy) return; setBusy(file); setError(''); try { await downloadServerFile(`/exports/${file}`, file, file === 'stock.xlsx' ? undefined : utcReportPeriod(start, end)); } catch (e) { setError(e instanceof Error ? e.message : purchaseErrorMessage(e)); } finally { setBusy(''); } }
 if (!canExport()) return null;
 return <div className="space-y-2"><Link to="/settings/backup" className="underline inline-block py-3">Open Export Center for separate report PDFs, CSV and XLSX</Link><div className="flex flex-wrap gap-2">{[['stock.xlsx', 'Stock XLSX'], ['purchases.pdf', 'Purchase PDF'], ['backup.zip', 'Purchase ZIP'], ['backup.json', 'Business JSON']].map(([file, label]) => <button key={file} disabled={!!busy} onClick={() => void download(file)} className="border rounded px-3 py-3 text-sm bg-white">{busy === file ? 'Preparing…' : label}</button>)}<CsvExportButton kind="report-suppliers" label="Supplier report CSV" params={{ start, end }} /><CsvExportButton kind="report-items" label="Item report CSV" params={{ start, end }} /></div>{error && <p role="alert" className="text-red-700">{error}</p>}</div>;
}
