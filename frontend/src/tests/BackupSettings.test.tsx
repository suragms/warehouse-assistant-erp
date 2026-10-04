import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BackupPage from '../pages/BackupPage';
import HelpGuidePage from '../pages/HelpGuidePage';
import { useAuthStore } from '../stores/authStore';
import { exportsApi, downloadExport } from '../api/exportsApi';
vi.mock('../api/exportsApi', async () => ({ ...await vi.importActual('../api/exportsApi'), exportsApi: { history: vi.fn(), run: vi.fn(), dryRun: vi.fn() }, downloadExport: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); vi.mocked(exportsApi.history).mockResolvedValue([]);
  useAuthStore.setState({ user: { id: 'u1', name: 'Owner', email: 'owner@example.test', businesses: [], currentBusiness: { businessId: 'a', businessName: 'A', role: 'Owner', permissions: [] } } });
});
function view(help = false) { return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{help ? <HelpGuidePage /> : <BackupPage />}</QueryClientProvider></MemoryRouter>); }
it('shows loading followed by an honest empty history', async () => {
  let resolve!: (value: []) => void; vi.mocked(exportsApi.history).mockReturnValue(new Promise(r => { resolve = r; }));
  view(); expect(screen.getByText('Loading backup history…')).toBeInTheDocument(); resolve([]); await screen.findByText('No server backups recorded yet.');
});
it('shows populated history with safe metadata and timestamps', async () => {
  vi.mocked(exportsApi.history).mockResolvedValue([{ id: 'log', runType: 'manual', status: 'success', filePath: 'backup_20261002.json', sizeBytes: 1234, rowCounts: { catalog: 5 }, durationMs: 20, createdAt: '2026-10-02T00:00:00Z' }]);
  view(); await screen.findByText('backup_20261002.json'); expect(screen.getByText('catalog: 5')).toBeInTheDocument(); expect(screen.getByText(/1,234 bytes/)).toBeInTheDocument();
});
it('offers a retry for failed history without exposing the raw error', async () => {
  vi.mocked(exportsApi.history).mockRejectedValueOnce(new Error('PRIVATE SERVER PATH')).mockResolvedValue([]); view();
  await screen.findByRole('button', { name: 'Retry history' }); expect(screen.queryByText('PRIVATE SERVER PATH')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry history' })); await screen.findByText('No server backups recorded yet.');
});
it('runs a server backup and refreshes its history', async () => {
  vi.mocked(exportsApi.run).mockResolvedValue({ id: 'log', runType: 'manual', status: 'success', rowCounts: {}, createdAt: '2026-10-02T00:00:00Z' }); view();
  fireEvent.click(screen.getByRole('button', { name: 'Run server backup' })); await screen.findByText('Server business backup completed.'); await waitFor(() => expect(exportsApi.history).toHaveBeenCalledTimes(2));
});
it('does not claim success when a server backup fails', async () => {
  vi.mocked(exportsApi.run).mockRejectedValue(new Error('PRIVATE')); view(); fireEvent.click(screen.getByRole('button', { name: 'Run server backup' }));
  await screen.findByText('Server backup could not be completed. Try again.'); expect(screen.queryByText('Server business backup completed.')).not.toBeInTheDocument();
});
it('uses the selected ZIP preset and reports failed downloads', async () => {
  vi.mocked(downloadExport).mockRejectedValue(new Error('No purchases in this range.')); view();
  fireEvent.change(screen.getByLabelText('Purchase ZIP range'), { target: { value: 'quarter' } }); fireEvent.click(screen.getByRole('button', { name: /^Purchase ZIP$/ }));
  await screen.findByText('No purchases in this range.'); expect(downloadExport).toHaveBeenCalledWith('zip', 'quarter');
});
it('rejects malformed JSON before calling restore validation', async () => {
  view(); fireEvent.change(screen.getByLabelText('Backup JSON'), { target: { value: '{bad' } }); fireEvent.click(screen.getByRole('button', { name: 'Validate backup' }));
  await screen.findByText('Enter valid backup JSON.'); expect(exportsApi.dryRun).not.toHaveBeenCalled();
});
it('shows dry-run results and never offers restore commit', async () => {
  vi.mocked(exportsApi.dryRun).mockResolvedValue({ valid: true, errors: [], rowCounts: { stock: 2 }, writesPerformed: false, restoreEnabled: false }); view();
  fireEvent.change(screen.getByLabelText('Backup JSON'), { target: { value: '{"businessId":"a"}' } }); fireEvent.click(screen.getByRole('button', { name: 'Validate backup' }));
  await screen.findByText('Backup structure is valid. No writes performed.'); expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
});
it('allows Manager operational exports without owner restore', async () => {
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'a', businessName: 'A', role: 'Manager', permissions: ['reports.view'] } } });
  view(); await screen.findByText('No server backups recorded yet.'); expect(screen.queryByLabelText('Backup JSON')).not.toBeInTheDocument();
});
it('denies Staff export and does not request private history', () => {
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'a', businessName: 'A', role: 'Staff', permissions: ['reports.view'] } } });
  view(); expect(screen.getByRole('alert')).toHaveTextContent('Export access is unavailable'); expect(exportsApi.history).not.toHaveBeenCalled();
});
it('renders only supported role-aware Help actions', () => {
  view(true); expect(screen.getByRole('heading', { name: 'How to use this app' })).toBeInTheDocument(); expect(screen.getByText('Use Scan with camera in supported secure browsers; otherwise enter the code or use a USB scanner.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Try it · Export & Backup', hidden: true })).toHaveAttribute('href', '/settings/backup');
});
