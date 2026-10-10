import apiClient from './apiClient';
import { canExport } from './exportsApi';
import { downloadServerFile, exportAccessScope } from './exportDownload';
export { downloadServerFile } from './exportDownload';

export type ReportDefinition = { id: string; title: string; category: string; period: boolean; statusFilter: 'none' | 'active' | 'purchase'; itemRequired: boolean; formats: string[] };
export type ExportHistory = { id: string; createdAt: string; status: 'generated'; details: { report: string; format: string; rowCount: number } };
export type ReportCatalog = { reports: ReportDefinition[]; timezone: string; maxRows: number; missingCapabilities: string[] };
export function utcReportPeriod(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw new Error('Choose a valid date range.');
  for (const date of [start, end]) { const parsed = new Date(date + 'T00:00:00.000Z'); if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Choose a valid date range.'); }
  return { start: start + 'T00:00:00.000Z', end: end + 'T23:59:59.999999Z' };
}
async function scopedData<T>(path: string) {
  const scope = exportAccessScope();
  if (!canExport()) throw new Error('Export access is unavailable.');
  const result = (await apiClient.get<T>(path)).data;
  if (scope !== exportAccessScope() || !canExport()) throw new Error('Export access changed. Refresh and try again.');
  return result;
}
export const reportExportsApi = {
  catalog: () => scopedData<ReportCatalog>('/exports/reports'),
  history: () => scopedData<{ items: ExportHistory[] }>('/exports/reports/history'),
  download: (id: string, format: string, params: Record<string, unknown>) => downloadServerFile(`/exports/reports/files/${encodeURIComponent(id)}.${encodeURIComponent(format)}`, `warehouse_${id}.${format}`, params),
};
