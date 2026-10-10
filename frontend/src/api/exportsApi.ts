import apiClient from './apiClient';
import { downloadServerFile, exportAccessScope, mayDownloadReports } from './exportDownload';
import { useAuthStore } from '../stores/authStore';
import type { PurchaseOrderDto } from './purchaseApi';
export type BackupLog = { id: string; runType: string; status: string; filePath?: string; sizeBytes?: number; rowCounts: Record<string, number>; durationMs?: number; errorMessage?: string; createdAt: string };
export type DryRun = { valid: boolean; errors: string[]; rowCounts: Record<string, number>; writesPerformed: false; restoreEnabled: false };
export type HistoricalField = { field: string; state: string; outcome: string; proposedValue: string | null; reasonCode: string; message: string; sourceCell: string | null; originalAllowedValue: string | null };
export type HistoricalPreview = { businessId: string; label: string; synthetic: boolean; writesPerformed: boolean; persistenceAvailable: boolean; confirmationAvailable: boolean;
  summary: { totalRows: number; validRows: number; warningRows: number; rejectedRows: number; ambiguousRows: number; notFoundRows: number; outOfScopeRows: number; duplicateRows: number };
  rows: { rowIdentifier: string; case: string; match: string; outcome: string; duplicate: boolean; fields: HistoricalField[];
    provenance: { sourceIdentifier: string; sourceKind: string; importIdentifier: string; rowIdentifier: string; sourceRowIdentifier: string; actor: string; recordedAt: string; sourceTimestamp: string | null; priorRevision: string | null; correctionReason: string | null } | null;
    unchangedCurrentValues: Record<string, string | null>; reasons: string[] }[]; unchangedAreas: string[] };
export const historicalFixtureSuites = { valid: 'Valid and zero values', missing: 'Missing historical facts', conflicts: 'Conflicting and invalid values', matching: 'Identity and tenant checks', provenance: 'Provenance and duplicates', mixed: 'All synthetic examples' };
export async function previewHistoricalFixture(fixtureId: keyof typeof historicalFixtureSuites) {
  const scope = backupDeviceKey(); const business = useAuthStore.getState().user?.currentBusiness;
  if (!business || !['Owner', 'SuperAdmin'].includes(business.role)) throw new Error('Historical preview access is unavailable.');
  const result = (await apiClient.post<HistoricalPreview>('/exports/historical/preview', { fixtureId })).data;
  const current = useAuthStore.getState().user?.currentBusiness;
  if (scope !== backupDeviceKey() || !current || !['Owner', 'SuperAdmin'].includes(current.role) || result.businessId !== current.businessId ||
      result.synthetic !== true || result.writesPerformed !== false || result.persistenceAvailable !== false || result.confirmationAvailable !== false)
    throw new Error('Preview scope changed or the response is unsafe. Try again.');
  return result;
}
export const exportsApi = {
  history: async () => { const scope = exportAccessScope(); const result = (await apiClient.get<{ items: BackupLog[] }>('/exports/backup/logs')).data.items; if (scope !== exportAccessScope() || !canExport()) throw new Error('Export access changed. Refresh and try again.'); return result; },
  run: async () => (await apiClient.post<BackupLog>('/exports/backup/run')).data,
  dryRun: async (payload: unknown) => (await apiClient.post<DryRun>('/exports/restore/dry-run', { payload })).data,
};
export type CsvKind = 'stock' | 'low-stock' | 'supplier' | 'report-suppliers' | 'report-items';
export async function downloadCsv(kind: CsvKind, params: { search?: string; filter?: string; start?: string; end?: string; categoryId?: string; supplierId?: string; severity?: string } = {}, supplierId?: string) {
  const financial = ['supplier', 'report-suppliers', 'report-items'].includes(kind);
  if (!canExport() || (financial && !['Owner', 'SuperAdmin'].includes(useAuthStore.getState().user?.currentBusiness?.role ?? ''))) throw new Error('CSV export access is unavailable.');
  const routes = { stock: 'stock.csv', 'low-stock': 'low-stock.csv', supplier: `suppliers/${encodeURIComponent(supplierId ?? '')}/purchases.csv`, 'report-suppliers': 'reports/suppliers.csv', 'report-items': 'reports/items.csv' };
  await downloadServerFile('/exports/' + routes[kind], `harisree_${kind}.csv`, params);
}
export function backupDeviceKey() {
  const user = useAuthStore.getState().user;
  return `backup:${user?.id}:${user?.currentBusiness?.businessId}`;
}
export function canExport() { return mayDownloadReports(); }
export function purchaseSelectionCsv(rows: readonly PurchaseOrderDto[]) {
  if (!['Owner', 'Admin', 'SuperAdmin'].includes(useAuthStore.getState().user?.currentBusiness?.role ?? '')) throw new Error('Only the owner or admin can export purchase financial values.');
  if (!rows.length) throw new Error('Select purchases from the current page.');
  const cell = (value: string) => '"' + (/^[=+@-]/.test(value.trimStart()) ? "'" : '') + value.replaceAll('"', '""') + '"';
  const statuses = ['Draft', 'Confirmed', 'Dispatched', 'Arrived', 'Verified', 'Completed', 'Cancelled'];
  return 'human_id,purchase_date,supplier,total_inr,remaining_inr,status\r\n' + rows.map(row => {
    if (!Number.isFinite(row.grandTotal) || !Number.isFinite(row.remainingAmount)) throw new Error('Refresh purchases before exporting financial values.');
    // Values and balances come from the purchase service; the browser only formats them.
    return [cell(row.orderNumber), cell(row.createdAt.slice(0, 10)), cell(row.supplierName), row.grandTotal.toFixed(2), row.remainingAmount!.toFixed(2), cell(statuses[row.status])].join(',');
  }).join('\r\n');
}
const dailyInFlight = new Map<string, Promise<void>>();
export function dailyAutoBackup() {
  const key = backupDeviceKey(); const day = new Date().toLocaleDateString('en-CA');
  if (!canExport() || localStorage.getItem(key + ':auto') !== 'true' || localStorage.getItem(key + ':auto-day') === day) return Promise.resolve();
  const pending = dailyInFlight.get(key); if (pending) return pending;
  const task = downloadExport('json').then(() => { if (backupDeviceKey() === key) localStorage.setItem(key + ':auto-day', day); }).finally(() => dailyInFlight.delete(key));
  dailyInFlight.set(key, task); return task;
}
export async function downloadExport(kind: 'stock' | 'pdf' | 'json' | 'zip', rangePreset = 'month') {
  const scope = backupDeviceKey();
  const route = { stock: 'stock.xlsx', pdf: 'purchases.pdf', json: 'backup.json', zip: 'backup' }[kind];
  const fallback = { stock: 'stock.xlsx', pdf: 'purchases.pdf', json: 'business-backup.json', zip: 'business-backup.zip' }[kind];
  await downloadServerFile('/exports/' + route, fallback, undefined, kind === 'zip' ? { rangePreset } : undefined);
  try { localStorage.setItem(scope + ':last-' + kind, new Date().toISOString()); } catch { /* Downloads still work without browser storage. */ }
}
