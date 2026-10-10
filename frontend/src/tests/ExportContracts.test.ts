import { beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/authStore';
import apiClient from '../api/apiClient';
import { backupDeviceKey, dailyAutoBackup, downloadExport, downloadCsv, purchaseSelectionCsv } from '../api/exportsApi';
import type { PurchaseOrderDto } from '../api/purchaseApi';
vi.mock('../api/apiClient', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const row = { orderNumber: '=unsafe', supplierName: 'Supplier, "quoted"', createdAt: '2026-10-02T00:00:00Z', grandTotal: 10.25, remainingAmount: 7.35, status: 1 } as PurchaseOrderDto;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); useAuthStore.setState({ user: { id: 'u1', name: 'Owner', email: 'owner@example.test', businesses: [], currentBusiness: { businessId: 'a', businessName: 'A', role: 'Owner', permissions: [] } } });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
it('copies the exact reference columns using the server balance and safe quoting', () => {
  const csv = purchaseSelectionCsv([row]); expect(csv.split('\r\n')[0]).toBe('human_id,purchase_date,supplier,total_inr,remaining_inr,status');
  expect(csv).toContain('10.25,7.35'); expect(csv).toContain('"\'=unsafe"'); expect(csv).toContain('"Supplier, ""quoted"""');
});
it('does not invent an absent financial balance', () => { expect(() => purchaseSelectionCsv([{ ...row, remainingAmount: undefined }])).toThrow('Refresh purchases'); });
it('rejects a Manager attempting to serialize purchase financial CSV', () => {
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'a', businessName: 'A', role: 'Manager', permissions: ['reports.view'] } } });
  expect(() => purchaseSelectionCsv([row])).toThrow('Only the owner');
});
it('deduplicates concurrent daily downloads and stamps only the successful business scope', async () => {
  let resolve!: (value: unknown) => void; vi.mocked(apiClient.get).mockReturnValue(new Promise(r => { resolve = r; })); const key = backupDeviceKey(); localStorage.setItem(key + ':auto', 'true');
  const first = dailyAutoBackup(), second = dailyAutoBackup(); expect(first).toBe(second); expect(apiClient.get).toHaveBeenCalledTimes(1);
  resolve({ data: new Blob(['{}']), headers: {} }); await first; expect(localStorage.getItem(key + ':auto-day')).toBeTruthy(); await dailyAutoBackup(); expect(apiClient.get).toHaveBeenCalledTimes(1);
});
it('does not download data after a selected-business change', async () => {
  let resolve!: (value: unknown) => void; vi.mocked(apiClient.get).mockReturnValue(new Promise(r => { resolve = r; })); const pending = downloadExport('json');
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'b', businessName: 'B', role: 'Owner', permissions: [] } } });
  resolve({ data: new Blob(['PRIVATE PREVIOUS TENANT']), headers: {} }); await expect(pending).rejects.toThrow('access changed'); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});
it('requests a fresh backend CSV with filters and a safe filename', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['header\nserver-value']), headers: { 'content-disposition': 'attachment; filename="harisree_stock_export.csv"' } });
  await downloadCsv('stock', { search: 'മലയാളം', filter: 'low-stock' }); expect(apiClient.get).toHaveBeenCalledWith('/exports/stock.csv', { params: { search: 'മലയാളം', filter: 'low-stock' }, responseType: 'blob' }); expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
});
it('denies financial CSV for Manager before making a request', async () => {
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'a', businessName: 'A', role: 'Manager', permissions: ['reports.view', 'stock.view'] } } });
  await expect(downloadCsv('report-items')).rejects.toThrow('unavailable'); expect(apiClient.get).not.toHaveBeenCalled();
});
it('discards CSV data when the business changes during a download', async () => {
  let resolve!: (value: unknown) => void; vi.mocked(apiClient.get).mockReturnValue(new Promise(r => { resolve = r; })); const pending = downloadCsv('stock');
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'b', businessName: 'B', role: 'Owner', permissions: [] } } });
  resolve({ data: new Blob(['OTHER BUSINESS']), headers: {} }); await expect(pending).rejects.toThrow('access changed'); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});
it('discards financial CSV when owner access changes during the request', async () => {
  let resolve!: (value: unknown) => void; vi.mocked(apiClient.get).mockReturnValue(new Promise(r => { resolve = r; })); const pending = downloadCsv('report-items');
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'a', businessName: 'A', role: 'Manager', permissions: ['reports.view', 'stock.view'] } } });
  resolve({ data: new Blob(['PRIVATE FINANCIAL DATA']), headers: {} }); await expect(pending).rejects.toThrow('access changed'); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});

it('discards a legacy JSON response after the owner becomes a Manager', async () => {
  let resolve!: (value: unknown) => void; vi.mocked(apiClient.get).mockReturnValue(new Promise(r => { resolve = r; })); const pending = downloadExport('json');
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'a', businessName: 'A', role: 'Manager', permissions: ['reports.view'] } } });
  resolve({ data: new Blob(['PRIVATE OWNER FINANCIAL DATA']), headers: {} }); await expect(pending).rejects.toThrow('access changed'); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});
