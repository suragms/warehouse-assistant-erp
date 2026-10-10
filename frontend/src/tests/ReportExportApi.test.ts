import { beforeEach, expect, it, vi } from 'vitest';
import { downloadServerFile, utcReportPeriod } from '../api/reportExportsApi';
import apiClient from '../api/apiClient';
import { useAuthStore } from '../stores/authStore';
vi.mock('../api/apiClient', () => ({ default: { get: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks(); useAuthStore.setState({ user: { id: 'u', name: 'Owner', email: 'o@test.local', businesses: [], currentBusiness: { businessId: 'b', businessName: 'B', role: 'Owner', permissions: [] } } });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
it('uses a safe server filename and revokes its URL after download', async () => {
  vi.useFakeTimers(); vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['%PDF-data']), headers: { 'content-disposition': 'attachment; filename="warehouse_stock.pdf"' } });
  await downloadServerFile('/exports/reports/files/stock.pdf', 'fallback.pdf'); expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  vi.runAllTimers(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test'); vi.useRealTimers();
});
it('rejects an empty successful download and does not save it', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob([]), headers: {} }); await expect(downloadServerFile('/export', 'report.pdf')).rejects.toThrow('empty download'); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});
it('discards delayed data after business or role/permission changes', async () => {
  let resolve!: (v: unknown) => void; vi.mocked(apiClient.get).mockReturnValue(new Promise(r => { resolve = r; }));
  const promise = downloadServerFile('/export', 'report.pdf'); const user = useAuthStore.getState().user!;
  useAuthStore.setState({ user: { ...user, currentBusiness: { ...user.currentBusiness!, role: 'Manager', permissions: ['reports.view'] } } }); resolve({ data: new Blob(['PRIVATE']), headers: {} });
  await expect(promise).rejects.toThrow('access changed'); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});
it('parses filter/limit errors and reports permission failures clearly', async () => {
  vi.mocked(apiClient.get).mockRejectedValue({ response: { status: 413, data: { message: 'Narrow this range to 5,000 rows.' } } }); await expect(downloadServerFile('/export', 'report.pdf')).rejects.toThrow('5,000 rows');
  vi.mocked(apiClient.get).mockRejectedValue({ response: { status: 403, data: new Blob(['PRIVATE']) } }); await expect(downloadServerFile('/export', 'report.pdf')).rejects.toThrow('permission');
});
it('includes the entire selected UTC day and validates the range', () => {
  expect(utcReportPeriod('2026-10-01', '2026-10-01')).toEqual({ start: '2026-10-01T00:00:00.000Z', end: '2026-10-01T23:59:59.999999Z' });
  expect(() => utcReportPeriod('2026-10-10', '2026-10-01')).toThrow('valid date');
});
