import { useState } from 'react';
import { ServerDownload } from '../components/ServerDownload';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { mlApi } from '../api/mlApi';
import { PageHeader } from '../components/ui';
import { useAuthStore } from '../stores/authStore';
import { hasPermission } from '../auth/hasPermission';
import HistoricalConsumptionImport from '../components/HistoricalConsumptionImport';

const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });
export default function MlPage() {
  const user = useAuthStore(s => s.user);
  const business = user?.currentBusiness?.businessId;
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [parameters] = useSearchParams();
  const [selected, setSelected] = useState(parameters.get('itemId') ?? ''); const [horizon, setHorizon] = useState(7);
  const [showMonitoring, setShowMonitoring] = useState(false);
  const items = useQuery({ queryKey: ['ml-items', business, search, page], queryFn: () => mlApi.items(search, page) });
  const result = useQuery({ queryKey: ['ml-analysis', business, selected, horizon], queryFn: () => mlApi.analyze(selected, horizon), enabled: !!selected, retry: 1 });
  const data = result.data;
  const monitoring = useQuery({ queryKey: ['ml-monitoring', business, selected, data?.generatedAt], queryFn: () => mlApi.monitoring(selected), enabled: !!selected && showMonitoring });
  const summary = useQuery({ queryKey: ['ml-monitoring-summary', business, selected, data?.generatedAt], queryFn: () => mlApi.monitoringSummary(selected), enabled: !!selected && showMonitoring });
  return <div className="space-y-5 min-w-0">
    <PageHeader title="Inventory predictions" subtitle="Consumption forecasts, reorder planning and unusual stock movements from your warehouse records." />
    <div className="grid gap-3 sm:grid-cols-3 bg-white border rounded-xl p-4">
      <label className="text-sm min-w-0">Find item<input className="block border rounded p-2 w-full mt-1" value={search} maxLength={100} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
      <label className="text-sm min-w-0">Item<select className="block border rounded p-2 w-full mt-1" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select an item</option>{items.data?.items.map(i => <option key={i.id} value={i.id}>{i.name} · {i.itemCode}</option>)}</select></label>
      <label className="text-sm">Forecast horizon<select className="block border rounded p-2 w-full mt-1" value={horizon} onChange={e => setHorizon(Number(e.target.value))}>{[7, 14, 30].map(n => <option key={n} value={n}>{n} days</option>)}</select></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3 text-sm"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button disabled={!items.data || page * 50 >= items.data.totalCount} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </div>
    {items.isPending && <p role="status">Loading items…</p>}
    {items.isError && <p role="alert">Items could not be loaded. <button className="underline" onClick={() => void items.refetch()}>Retry items</button></p>}
    {items.data?.items.length === 0 && <p>No matching items.</p>}
    {!selected && <p>Select an item to inspect its history and forecast availability.</p>}
    {selected && result.isPending && <p role="status">Loading prediction…</p>}
    {result.isError && <p role="alert">Predictions could not be loaded. <button className="underline" onClick={() => void result.refetch()}>Retry prediction</button></p>}
    {data && <>
      {data.status === 'ready' && <ServerDownload path={`/exports/ml/${selected}.csv`} filename="forecast.csv" label="Export forecast CSV" params={{ horizon }} />}
      <section className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold text-lg break-words">{data.itemName}</h2><p>Available stock: {number(data.currentStock)} {data.unit}</p><p role="status">{data.message}</p>
        {data.status !== 'ready' && <Link className="text-teal-700 underline" to="/operations">Record confirmed daily usage</Link>}
        {data.reorder && <div className="grid sm:grid-cols-3 gap-4 pt-3"><p>Forecast consumption<br /><strong>{number(data.forecast.reduce((sum, p) => sum + p.quantity, 0))} {data.unit}</strong></p><p>Suggested reorder<br /><strong>{number(data.reorder.quantity)} {data.unit}</strong></p><p>Stockout scenario<br /><strong>{data.reorder.riskCategory.replaceAll('_', ' ')}</strong></p><p className="sm:col-span-3 text-sm">{data.reorder.reason}</p><p>Threshold date: {data.reorder.reorderDate ?? 'Beyond this horizon'}</p>
          {hasPermission(user, 'purchase.create') && <Link className="text-teal-700 underline" to="/purchases/new">Review a new purchase</Link>}</div>}
      </section>
      {data.forecast.length > 0 && <section className="bg-white border rounded-xl p-4 space-y-3"><h2 className="font-semibold">Daily forecast</h2><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Date</th><th className="p-2">Forecast</th><th className="p-2">Lower scenario</th><th className="p-2">Upper scenario</th></tr></thead><tbody>{data.forecast.map(p => <tr key={p.date} className="border-t"><td className="p-2 whitespace-nowrap">{p.date}</td><td className="p-2">{number(p.quantity)}</td><td className="p-2">{number(p.lower)}</td><td className="p-2">{number(p.upper)}</td></tr>)}</tbody></table></div>
        <p className="text-sm break-all">Model: {data.model} · Trained {data.trainedAt?.slice(0, 10)} · Version {data.modelVersion}</p>
        {data.metrics && <p className="text-sm">Held-out MAE {number(data.metrics.mae)} · RMSE {number(data.metrics.rmse)} · WAPE {data.metrics.wape === null ? 'Unavailable for zero total demand' : `${number(data.metrics.wape * 100)}%`}</p>}
      </section>}
      <section className="bg-white border rounded-xl p-4 space-y-3"><h2 className="font-semibold">Confirmed daily history</h2>{data.history.length === 0 ? <p>No consecutive confirmed history through yesterday.</p> : <div className="max-h-64 overflow-auto"><table className="w-full text-sm text-left"><thead><tr><th>Date</th><th>Consumption ({data.unit})</th></tr></thead><tbody>{data.history.map(p => <tr key={p.date}><td className="py-1">{p.date}</td><td>{number(p.quantity)}</td></tr>)}</tbody></table></div>}</section>
      <section className="bg-white border rounded-xl p-4 space-y-3"><h2 className="font-semibold">Unusual movements</h2><p className="text-sm">Statistical review of the last 30 days against earlier movements of the same type. At least 20 prior observations are needed.</p>{data.anomalies.length === 0 ? <p>No supported anomalies found in the available history.</p> : data.anomalies.map(a => <div className="border-t pt-2" key={a.id}><p>{a.date.slice(0, 10)} · {a.type} · {number(a.quantity)} {data.unit}</p><p className="text-sm">{a.explanation}</p></div>)}</section>
    </>}
    {selected && <section className="bg-white border rounded-xl p-4 space-y-3"><button className="underline" onClick={() => setShowMonitoring(v => !v)} aria-expanded={showMonitoring}>Prediction outcomes</button>
      {showMonitoring && <><p className="text-sm">Latest 100 predictions from the last two years. Actual totals appear only after every day in the horizon has valid confirmed usage.</p>
        {summary.isError && <p role="alert">Monitoring metrics could not be loaded. <button className="underline" onClick={() => void summary.refetch()}>Retry metrics</button></p>}
        {summary.data?.map(s => <div className="border rounded p-3 text-sm break-words" key={`${s.modelVersion}-${s.horizon}`} role={s.reviewAlert ? 'alert' : undefined}><p>{s.horizon}-day totals · {s.completedForecasts} completed forecasts · MAE {number(s.mae)} · RMSE {number(s.rmse)} · WAPE {s.wape === null ? 'Undefined for zero total usage' : `${number(s.wape * 100)}%`}</p><p>{s.message}</p><p className="break-all">Model: {s.modelVersion}</p></div>)}
        {monitoring.isPending && <p role="status">Loading outcomes…</p>}
        {monitoring.isError && <p role="alert">Outcomes could not be loaded. <button className="underline" onClick={() => void monitoring.refetch()}>Retry outcomes</button></p>}
        {monitoring.data?.length === 0 && <p>No prediction snapshots yet.</p>}
        {!!monitoring.data?.length && <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th>Start date</th><th>Horizon</th><th>Predicted</th><th>Actual</th><th>Model version</th></tr></thead><tbody>{monitoring.data.map(row => <tr key={row.id} className="border-t"><td className="p-2 whitespace-nowrap">{row.startDate}</td><td>{row.horizon} days</td><td>{number(row.predictedQuantity)}</td><td>{row.actualQuantity === null ? `Awaiting usage (${row.observedDays}/${row.horizon} days)` : number(row.actualQuantity)}</td><td className="p-2 break-all">{row.modelVersion}</td></tr>)}</tbody></table></div>}
      </>}
    </section>}
    <HistoricalConsumptionImport key={business} />
  </div>;
}
