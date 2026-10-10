import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DatabaseBackupPanel from '../components/DatabaseBackupPanel';
import { databaseBackupApi, type DatabaseBackupOverview } from '../api/databaseBackupApi';
import { useAuthStore } from '../stores/authStore';
vi.mock('../api/databaseBackupApi', async () => ({ ...await vi.importActual('../api/databaseBackupApi'), databaseBackupApi: { overview: vi.fn(), create: vi.fn(), settings: vi.fn(), verify: vi.fn(), download: vi.fn(), remove: vi.fn(), pin: vi.fn(), recovery: vi.fn() } }));
const empty = (): DatabaseBackupOverview => ({ canRecover: true, overview: { settings: { id: 1, revision: 'r1', dailyEnabled: false, dailyHour: 2, dailyMinute: 0, monthlyEnabled: false, monthlyDay: 31, monthlyHour: 3, monthlyMinute: 0, timeZone: 'Asia/Kolkata', dailyRetention: 14, monthlyRetention: 12, manualRetention: 10 }, health: { ready: true, destination: 'Protected server storage', durability: 'persistent', offsiteConfigured: false, warnings: ['offsite_copy_not_configured'] }, jobs: [], liveRestoreEnabled: false } });
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(databaseBackupApi.overview).mockResolvedValue(empty());
  useAuthStore.setState({ user: { id: 'u1', name: 'Operator', email: 'operator@test.local', businesses: [], currentBusiness: { businessId: 'b1', businessName: 'A', role: 'SuperAdmin', permissions: [] } } });
});
function view() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><DatabaseBackupPanel /></QueryClientProvider>); }
it('ordinary business administrators cannot request full database history', () => {
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'b1', businessName: 'A', role: 'Admin', permissions: [] } } }); view(); expect(databaseBackupApi.overview).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Create Backup Now' })).not.toBeInTheDocument();
});
it('shows loading, empty state, disabled schedules and offsite warning', async () => {
  view(); expect(screen.getByRole('status')).toHaveTextContent('Loading database'); await screen.findByText('No database backups yet.'); expect(screen.getByText('Automatic database backups are disabled.')).toBeInTheDocument(); expect(screen.getByText(/No offsite copy is configured/)).toBeInTheDocument();
});
it('reports denied access without exposing raw errors and permits retry', async () => {
  vi.mocked(databaseBackupApi.overview).mockRejectedValueOnce({ response: { status: 403, data: 'SECRET' } }).mockResolvedValue(empty()); view(); await screen.findByText(/Platform operator access is not enabled/); expect(screen.queryByText('SECRET')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Retry database backup settings' })); await screen.findByText('No database backups yet.');
});
it('queues manual backup and reloads durable history', async () => {
  vi.mocked(databaseBackupApi.create).mockResolvedValue({ id: 'j1', status: 'queued' }); view(); fireEvent.click(await screen.findByRole('button', { name: 'Create Backup Now' })); await waitFor(() => expect(databaseBackupApi.create).toHaveBeenCalledTimes(1)); await waitFor(() => expect(databaseBackupApi.overview).toHaveBeenCalledTimes(2));
});
it('does not create duplicate jobs while a server job is active', async () => {
  const data = empty(); data.overview.jobs = [{ id: 'j1', kind: 'manual', status: 'running', stage: 'Creating consistent PostgreSQL archive', createdAt: '2026-10-10T10:00:00Z', pinned: false, offsiteVerified: false, attempts: 1 }]; vi.mocked(databaseBackupApi.overview).mockResolvedValue(data); view(); expect(await screen.findByRole('button', { name: 'Create Backup Now' })).toBeDisabled(); expect(screen.getByText(/Creating consistent PostgreSQL archive/)).toBeInTheDocument();
});
it('saves independent server schedules without browser timers', async () => {
  vi.mocked(databaseBackupApi.settings).mockResolvedValue({}); view(); fireEvent.click(await screen.findByLabelText('Enable monthly server backups')); fireEvent.change(screen.getByLabelText('Monthly time'), { target: { value: '04:15' } }); fireEvent.click(screen.getByRole('button', { name: 'Save backup schedules' })); await screen.findByText('Server schedules saved.'); expect(databaseBackupApi.settings).toHaveBeenCalledWith(expect.objectContaining({ dailyEnabled: false, monthlyEnabled: true, monthlyDay: 31, monthlyHour: 4, monthlyMinute: 15, revision: 'r1' }), expect.anything());
});
it('shows safe network failure and never claims a completed archive', async () => {
  vi.mocked(databaseBackupApi.create).mockRejectedValue(new Error('SECRET')); view(); fireEvent.click(await screen.findByRole('button', { name: 'Create Backup Now' })); await screen.findByText(/Check your connection and retry/); expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
});
it('provides verify/download and explicit separately authorized recovery confirmation', async () => {
  const data = empty(); data.overview.jobs = [{ id: 'j1', kind: 'manual', status: 'succeeded', stage: 'Encrypted archive ready', createdAt: '2026-10-10T10:00:00Z', completedAt: '2026-10-10T10:01:00Z', sizeBytes: 1234, pinned: false, offsiteVerified: false, verifiedAt: '2026-10-10T10:01:00Z', attempts: 1 }]; data.overview.jobs.push({ id: 'v1', sourceId: 'j1', kind: 'verify', status: 'succeeded', stage: 'Verified', createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), pinned: false, offsiteVerified: false, attempts: 1 }); vi.mocked(databaseBackupApi.overview).mockResolvedValue(data); vi.mocked(databaseBackupApi.recovery).mockResolvedValue({ message: 'Archive pinned. Isolated restore required.' }); view(); await screen.findByText('j1.wab');
  fireEvent.click(screen.getByRole('button', { name: 'Verify archive' })); await waitFor(() => expect(databaseBackupApi.verify).toHaveBeenCalledWith('j1'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download encrypted archive' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Download encrypted archive' })); await waitFor(() => expect(databaseBackupApi.download).toHaveBeenCalledWith('j1'));
  await waitFor(() => expect(screen.getByLabelText('Recovery archive')).toBeEnabled()); fireEvent.change(screen.getByLabelText('Recovery archive'), { target: { value: 'j1' } }); expect(screen.getByRole('button', { name: 'Prepare guided recovery' })).toBeDisabled(); fireEvent.click(screen.getByLabelText(/I authorize recovery preparation/)); fireEvent.click(screen.getByRole('button', { name: 'Prepare guided recovery' })); await screen.findByText('Archive pinned. Isolated restore required.'); expect(databaseBackupApi.recovery).toHaveBeenCalledWith('j1', true);
});
it('hides recovery controls when the recovery permission is absent', async () => {
  const data = empty(); data.canRecover = false; vi.mocked(databaseBackupApi.overview).mockResolvedValue(data); view(); await screen.findByRole('button', { name: 'Create Backup Now' }); expect(screen.queryByLabelText('Recovery archive')).not.toBeInTheDocument();
});
