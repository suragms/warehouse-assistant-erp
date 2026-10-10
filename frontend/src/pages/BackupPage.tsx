import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/ui';
import { useAuthStore } from '../stores/authStore';
import { backupDeviceKey, canExport, dailyAutoBackup, downloadExport, exportsApi, type DryRun } from '../api/exportsApi';
const section = 'rounded-xl border bg-white p-4 space-y-4 min-w-0';
const button = 'px-4 py-3 rounded bg-emerald-800 text-white disabled:opacity-50';
const field = 'block w-full min-w-0 border rounded p-3 mt-1';
const names = { stock: 'Stock Excel', pdf: 'Monthly purchases PDF', json: 'Business JSON · last 90 days', zip: 'Purchase ZIP' };
function deviceRead(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
export default function BackupPage() {
  const user = useAuthStore(s => s.user); const owner = ['Owner', 'Admin', 'SuperAdmin'].includes(user?.currentBusiness?.role ?? '');
  const allowed = canExport(); const key = backupDeviceKey(); const cache = useQueryClient();
  const [preset, setPreset] = useState('month'), [notice, setNotice] = useState(''), [failure, setFailure] = useState(''), [text, setText] = useState('');
  const [automatic, setAutomatic] = useState(deviceRead(key + ':auto') === 'true'), [result, setResult] = useState<DryRun | null>(null);
  const history = useQuery({ queryKey: ['settings', 'backup-history'], queryFn: exportsApi.history, enabled: allowed, retry: false });
  const run = useMutation({ mutationFn: exportsApi.run, onSuccess: () => { setNotice('Server business backup completed.'); void cache.invalidateQueries({ queryKey: ['settings', 'backup-history'] }); void cache.invalidateQueries({ queryKey: ['operations', 'owner-dashboard'] }); }, onError: () => { setFailure('Server backup could not be completed. Try again.'); void history.refetch(); } });
  const download = useMutation({ mutationFn: (kind: keyof typeof names) => downloadExport(kind, preset), onSuccess: () => setNotice('Download started.'), onError: e => setFailure(e.message) });
  const dry = useMutation({ mutationFn: async () => {
    if (new Blob([text]).size > 10485760) throw new Error('Backup JSON must be under 10 MB.');
    let parsed: unknown; try { parsed = JSON.parse(text); } catch { throw new Error('Enter valid backup JSON.'); }
    return exportsApi.dryRun(parsed);
  }, onSuccess: data => { setResult(data); setNotice('Validation completed. No data was changed.'); }, onError: e => setFailure(e instanceof SyntaxError ? 'Enter valid backup JSON.' : (e as { response?: unknown }).response ? 'Backup validation could not be completed. Try again.' : e.message) });
  const busy = run.isPending || download.isPending || dry.isPending;
  function begin() { setNotice(''); setFailure(''); }
  async function setAuto(enabled: boolean) {
    begin(); try { localStorage.setItem(key + ':auto', String(enabled)); setAutomatic(enabled); } catch { setFailure('Browser storage is unavailable. Automatic download could not be saved.'); return; }
    if (enabled) {
      try { await dailyAutoBackup(); setNotice('Automatic daily JSON download enabled.'); }
      catch { setFailure('Automatic download failed. It will retry when you next open the app.'); }
    }
  }
  return <div className="space-y-6 min-w-0"><PageHeader title="Export & Backup" subtitle="Keep local copies of your business data." /><Link to="/settings" className="underline inline-block min-h-12">Back to Settings</Link>
    {!allowed ? <p role="alert">Export access is unavailable for this role.</p> : <>
      {notice && <p role="status" className="text-emerald-800">{notice}</p>}{failure && <p role="alert" className="text-red-700">{failure}</p>}
      <section className={section}><h2 className="text-lg font-semibold">Downloads</h2><p>Reports use saved business records. Financial values are visible only to the owner.</p><label className="block">Purchase ZIP range<select className={field} value={preset} onChange={e => setPreset(e.target.value)} disabled={busy}><option value="month">This month</option><option value="quarter">Last 90 days</option><option value="all">All purchases</option></select></label>
        <div className="grid sm:grid-cols-2 gap-4">{(Object.keys(names) as (keyof typeof names)[]).map(kind => <div key={kind} className="min-w-0 space-y-2"><button className={button + ' w-full'} disabled={busy} onClick={() => { begin(); download.mutate(kind); }}>{names[kind]}</button><p className="text-sm break-words">Last download: {deviceRead(key + ':last-' + kind) ? new Date(deviceRead(key + ':last-' + kind)!).toLocaleString() : 'Never on this device'}</p></div>)}</div>
        {download.isPending && <p role="status">Preparing download…</p>}<label className="flex items-center gap-3 min-h-12"><input type="checkbox" checked={automatic} disabled={busy} onChange={e => void setAuto(e.target.checked)} />Download JSON once daily when this app opens</label><p className="text-sm">This option belongs to this browser and business. Allow browser downloads when prompted.</p>
      </section>
      <section className={section}><h2 className="text-lg font-semibold">Server business backups</h2><p>Business JSON is stored nightly at 02:00 India time while the server runs. The latest 14 successful files are retained. Credentials and account secrets are excluded.</p><button className={button} disabled={busy} onClick={() => { begin(); run.mutate(); }}>Run server backup</button>{run.isPending && <p role="status">Saving business backup…</p>}</section>
      <section className={section}><h2 className="text-lg font-semibold">Backup history</h2><p className="text-sm">Latest 50 server runs. Older files may have expired; history remains.</p>{history.isLoading && <p role="status">Loading backup history…</p>}{history.isError && <p role="alert">Backup history could not be loaded. <button className="underline min-h-12 px-3" onClick={() => void history.refetch()}>Retry history</button></p>}
        {history.data?.length === 0 && <p>No server backups recorded yet.</p>}{history.data && history.data.length > 0 && <ol className="space-y-4">{history.data.map(log => <li key={log.id} className="border rounded p-3 space-y-1 break-words"><p><strong>{log.status === 'success' ? 'Completed' : 'Failed'}</strong> · {log.runType} · <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString()}</time></p>{log.filePath && <p>{log.filePath}</p>}{log.sizeBytes != null && <p>{log.sizeBytes.toLocaleString()} bytes · {log.durationMs ?? 0} ms</p>}<p>{Object.entries(log.rowCounts).map(([type, count]) => `${type}: ${count}`).join(' · ')}</p>{log.status !== 'success' && <p>Business backup could not be completed.</p>}</li>)}</ol>}
      </section>
      {owner && <section className={section}><h2 className="text-lg font-semibold">Restore validation</h2><p>Check a downloaded or stored business JSON backup. Validation does not change your business data. Restoring backups is currently unavailable.</p><form onSubmit={e => { e.preventDefault(); begin(); setResult(null); dry.mutate(); }}><label className="block" htmlFor="backup-json">Backup JSON</label><textarea id="backup-json" className={field + ' min-h-40 font-mono text-sm'} value={text} onChange={e => setText(e.target.value)} required disabled={busy} maxLength={10485760} /><button className={button + ' mt-3'} disabled={busy || !text.trim()}>Validate backup</button></form>{dry.isPending && <p role="status">Validating backup…</p>}{result && <div role="status"><p>{result.valid ? 'Backup structure is valid.' : 'Backup needs attention.'} No writes performed.</p>{result.errors.length > 0 && <ul className="list-disc pl-5">{result.errors.map(error => <li key={error}>{error}</li>)}</ul>}<p>{Object.entries(result.rowCounts).map(([type, count]) => `${type}: ${count}`).join(' · ')}</p></div>}</section>}
    </>}
  </div>;
}
