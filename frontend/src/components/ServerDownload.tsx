import { useState } from 'react';
import { downloadServerFile } from '../api/reportExportsApi';
import { canExport } from '../api/exportsApi';
export function ServerDownload({ path, filename, label, params }: { path: string; filename: string; label: string; params?: Record<string, unknown> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!canExport()) return null;
  return <span className="inline-flex flex-col gap-1"><button className="border rounded px-3 py-3 bg-white disabled:opacity-50" disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try {
      await downloadServerFile(path, filename, params);
    } catch (e) { setError(e instanceof Error ? e.message : 'Download failed. Check your filters and permissions, then retry.'); } finally { setBusy(false); }
  }}>{busy ? 'Preparing…' : label}</button>{error && <span role="alert" className="text-sm text-red-700">{error}</span>}</span>;
}
