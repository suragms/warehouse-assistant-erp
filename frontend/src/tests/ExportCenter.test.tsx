import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ExportCenter from '../components/ExportCenter';
import { reportExportsApi, type ReportDefinition } from '../api/reportExportsApi';
import { mlApi } from '../api/mlApi';
import { useAuthStore } from '../stores/authStore';
vi.mock('../api/reportExportsApi', async () => ({ ...await vi.importActual('../api/reportExportsApi'), reportExportsApi: { catalog: vi.fn(), history: vi.fn(), download: vi.fn() } }));
vi.mock('../api/mlApi', () => ({ mlApi: { items: vi.fn() } }));
const reports: ReportDefinition[] = [
  { id: 'stock', title: 'Current stock', category: 'Inventory', period: false, statusFilter: 'none', itemRequired: false, formats: ['pdf', 'csv', 'xlsx'] },
  { id: 'purchases', title: 'Purchase orders', category: 'Purchases', period: true, statusFilter: 'purchase', itemRequired: false, formats: ['pdf', 'csv', 'xlsx'] },
  { id: 'forecast', title: 'Item forecast', category: 'Analytics', period: false, statusFilter: 'none', itemRequired: true, formats: ['pdf', 'csv', 'xlsx'] },
];
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u', name: 'Owner', email: 'owner@example.test', businesses: [], currentBusiness: { businessId: 'b', businessName: 'Business', role: 'Owner', permissions: [] } } });
  vi.mocked(reportExportsApi.catalog).mockResolvedValue({ reports, timezone: 'UTC', maxRows: 5000, missingCapabilities: ['Historical balances unavailable.'] });
  vi.mocked(reportExportsApi.history).mockResolvedValue({ items: [] }); vi.mocked(reportExportsApi.download).mockResolvedValue();
  vi.mocked(mlApi.items).mockResolvedValue({ items: [{ id: 'i1', name: 'Café rice', itemCode: 'R1', unit: 'KG' }], totalCount: 1 });
});
function view() { return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ExportCenter /></QueryClientProvider></MemoryRouter>); }
it('offers a separate export per server-supported report and disables historical filters on snapshots', async () => {
  view(); await screen.findByRole('button', { name: 'Download Current stock PDF' }); expect(screen.getByLabelText('From date (UTC)')).toBeDisabled();
  expect(screen.getByLabelText('Report status')).toBeDisabled(); expect(screen.queryByRole('option', { name: 'Stock transfer report' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Download Current stock PDF' })); await waitFor(() => expect(reportExportsApi.download).toHaveBeenCalledWith('stock', 'pdf', { status: 'all' }));
  expect(await screen.findByText(/Current stock: download started/)).toBeInTheDocument();
});
it('applies category, complete UTC day range, status and format to only the selected report', async () => {
  view(); await screen.findByRole('option', { name: 'Purchase orders' }); fireEvent.change(screen.getByLabelText('Report category'), { target: { value: 'Purchases' } });
  fireEvent.change(screen.getByLabelText('From date (UTC)'), { target: { value: '2026-10-01' } }); fireEvent.change(screen.getByLabelText('Through date (UTC)'), { target: { value: '2026-10-10' } });
  fireEvent.change(screen.getByLabelText('Report status'), { target: { value: 'Confirmed' } }); fireEvent.change(screen.getByLabelText('Export format'), { target: { value: 'xlsx' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download Purchase orders XLSX' }));
  await waitFor(() => expect(reportExportsApi.download).toHaveBeenCalledWith('purchases', 'xlsx', { status: 'Confirmed', start: '2026-10-01T00:00:00.000Z', end: '2026-10-10T23:59:59.999999Z' }));
});
it('shows preparation and errors without claiming that a failed download succeeded', async () => {
  let reject!: (error: Error) => void; vi.mocked(reportExportsApi.download).mockReturnValue(new Promise((_, r) => { reject = r; })); view();
  fireEvent.click(await screen.findByRole('button', { name: 'Download Current stock PDF' })); await screen.findByRole('button', { name: 'Preparing report…' });
  reject(new Error('This export is too large. Choose a shorter range.')); await screen.findByRole('alert'); expect(screen.queryByText(/download started/)).not.toBeInTheDocument();
});
it('shows empty and failed histories honestly and offers retry', async () => {
  vi.mocked(reportExportsApi.history).mockRejectedValueOnce(new Error('PRIVATE')).mockResolvedValue({ items: [] }); view();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry report history' })); await screen.findByText('No report exports recorded yet.'); expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
});
it('offers forecast selection and passes only the selected real item and horizon', async () => {
  view(); await screen.findByRole('option', { name: 'Item forecast' }); fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'forecast' } });
  expect(screen.getByRole('button', { name: 'Download Item forecast PDF' })).toBeDisabled(); await screen.findByRole('option', { name: 'Café rice · R1 · KG' });
  fireEvent.change(screen.getByLabelText('Forecast item'), { target: { value: 'i1' } }); fireEvent.change(screen.getByLabelText('Forecast horizon'), { target: { value: '14' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download Item forecast PDF' })); await waitFor(() => expect(reportExportsApi.download).toHaveBeenCalledWith('forecast', 'pdf', { status: 'all', itemId: 'i1', horizon: 14 }));
});
it('renders server-granted choices only and hides all exports for Staff', async () => {
  vi.mocked(reportExportsApi.catalog).mockResolvedValue({ reports: [], timezone: 'UTC', maxRows: 5000, missingCapabilities: [] }); const result = view(); await screen.findByText('No reports are available with your current permissions.'); result.unmount();
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'b', businessName: 'B', role: 'Staff', permissions: ['reports.view'] } } }); view(); expect(screen.queryByText('Export Center')).not.toBeInTheDocument();
});
