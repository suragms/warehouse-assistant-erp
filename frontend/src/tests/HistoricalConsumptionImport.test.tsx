import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HistoricalConsumptionImport from '../components/HistoricalConsumptionImport';
import apiClient from '../api/apiClient';
import { useAuthStore } from '../stores/authStore';
vi.mock('../api/apiClient', () => ({ default: { post: vi.fn() } }));
const preview = { totalRows: 1, validRows: 1, errorCount: 0, errors: [], sample: [{ row: 2, itemId: 'item', date: '2026-10-02', quantity: 5, unit: 'PCS' }], canCommit: true, previewToken: 'scoped-proof' };
const csv = 'business_id,warehouse_id,item_id,date,quantity,unit,transaction_type,recorded_at\nb,b,i,2026-10-02,5,PCS,consumption_daily_total,2026-10-02T23:00:00Z';
function open(role = 'Owner') { useAuthStore.setState({ user: { id: 'u', name: 'Owner', email: 'local@example.invalid', businesses: [], currentBusiness: { businessId: 'b', businessName: 'Warehouse', role, permissions: ['stock.view'] } } }); return render(<QueryClientProvider client={new QueryClient()}><HistoricalConsumptionImport /></QueryClientProvider>); }
async function fill() {
  await userEvent.click(screen.getByText('Import historical consumption'));
  const file = new File([csv], 'consumption.csv', { type: 'text/csv' }); Object.defineProperty(file, 'text', { value: async () => csv });
  await userEvent.upload(screen.getByLabelText('Consumption CSV'), file);
  await userEvent.type(screen.getByLabelText('Trusted source description'), 'Reviewed daily ledger');
  await userEvent.click(screen.getByRole('checkbox'));
}
beforeEach(() => vi.resetAllMocks());
it('hides the import for staff', () => { open('Staff'); expect(screen.queryByText('Import historical consumption')).not.toBeInTheDocument(); });
it('requires a file, source and explicit attestation before preview', async () => { open(); await userEvent.click(screen.getByText('Import historical consumption')); expect(screen.getByRole('button', { name: 'Preview consumption import' })).toBeDisabled(); });
it('previews before commit and shows the returned import summary', async () => {
  vi.mocked(apiClient.post).mockResolvedValueOnce({ data: preview }).mockResolvedValueOnce({ data: { importedRows: 1 } }); open(); await fill();
  await userEvent.click(screen.getByRole('button', { name: 'Preview consumption import' })); expect(await screen.findByText('1/1 valid rows. 0 validation errors.')).toBeVisible();
  expect(apiClient.post).toHaveBeenCalledTimes(1); await userEvent.click(screen.getByRole('button', { name: 'Confirm historical import' }));
  expect(await screen.findByText('Imported 1 daily consumption records. Current stock was not changed.')).toBeVisible();
  expect(apiClient.post).toHaveBeenLastCalledWith('/ml/history/commit', expect.objectContaining({ previewToken: 'scoped-proof' }));
});
it('shows row errors and blocks commit', async () => { vi.mocked(apiClient.post).mockResolvedValue({ data: { ...preview, validRows: 0, errorCount: 1, canCommit: false, previewToken: null, errors: [{ row: 2, message: 'Unknown item' }] } }); open(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Preview consumption import' })); expect(await screen.findByText('Row 2: Unknown item')).toBeVisible(); expect(screen.getByRole('button', { name: 'Confirm historical import' })).toBeDisabled(); });
it('invalidates confirmation after changing the source', async () => { vi.mocked(apiClient.post).mockResolvedValue({ data: preview }); open(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Preview consumption import' })); await screen.findByText('1/1 valid rows. 0 validation errors.'); await userEvent.type(screen.getByLabelText('Trusted source description'), ' edited'); expect(screen.queryByRole('button', { name: 'Confirm historical import' })).not.toBeInTheDocument(); });
it('reports uncertain commits without claiming success or rollback', async () => { vi.mocked(apiClient.post).mockResolvedValueOnce({ data: preview }).mockRejectedValueOnce(new Error('conflict')); open(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Preview consumption import' })); await userEvent.click(await screen.findByRole('button', { name: 'Confirm historical import' })); expect(await screen.findByRole('alert')).toHaveTextContent('result could not be confirmed'); expect(screen.queryByText(/Imported 1/)).not.toBeInTheDocument(); });
