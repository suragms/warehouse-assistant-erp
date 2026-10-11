import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CsvExportButton } from '../components/CsvExportButton';
import { useAuthStore } from '../stores/authStore';
import { downloadCsv } from '../api/exportsApi';
vi.mock('../api/exportsApi', async () => ({ ...await vi.importActual('../api/exportsApi'), downloadCsv: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ isAuthenticated: true, user: { id: 'u', name: 'Owner', email: 'owner@test.local', businesses: [], currentBusiness: { businessId: 'b', businessName: 'Business', role: 'Owner', permissions: [] } } }); });
it('disables repeated downloads while pending and keeps an actionable failure', async () => {
  let reject!: (value: unknown) => void; vi.mocked(downloadCsv).mockReturnValue(new Promise((_, r) => { reject = r; }));
  render(<CsvExportButton kind="stock" label="Stock CSV" params={{ search: 'Rice' }} />); fireEvent.click(screen.getByRole('button')); expect(screen.getByRole('button')).toBeDisabled(); fireEvent.click(screen.getByRole('button')); expect(downloadCsv).toHaveBeenCalledTimes(1);
  reject(new Error('CSV could not be downloaded. Try again.')); expect(await screen.findByRole('alert')).toHaveTextContent('Try again'); expect(screen.getByRole('button')).toBeEnabled();
});
it('hides financial exports from Manager and all CSV exports from Staff', () => {
  const user = useAuthStore.getState().user!; useAuthStore.setState({ user: { ...user, currentBusiness: { ...user.currentBusiness!, role: 'Manager', permissions: ['reports.view', 'stock.view'] } } });
  const { rerender } = render(<CsvExportButton kind="report-items" label="Item CSV" />); expect(screen.queryByRole('button')).toBeNull();
  useAuthStore.setState({ user: { ...user, currentBusiness: { ...user.currentBusiness!, role: 'Staff', permissions: ['reports.view', 'stock.view'] } } }); rerender(<CsvExportButton kind="stock" label="Stock CSV" />); expect(screen.queryByRole('button')).toBeNull();
});
