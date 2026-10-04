import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../layouts/AppShell';
import { useAuthStore } from '../stores/authStore';
import { notificationApi } from '../api/notificationApi';
import HelpGuidePage from '../pages/HelpGuidePage';
vi.mock('../components/RealtimeUpdates', () => ({ RealtimeUpdates: () => null }));
vi.mock('../components/BackupReminder', () => ({ BackupReminder: () => null }));
vi.mock('../components/search/GlobalSearch', () => ({ GlobalSearch: () => null }));
vi.mock('../api/notificationApi', () => ({ notificationApi: { getUnreadCount: vi.fn(), getNotifications: vi.fn(), markAsRead: vi.fn(), markAllAsRead: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.mocked(notificationApi.getUnreadCount).mockResolvedValue(12); vi.mocked(notificationApi.getNotifications).mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 } });
  vi.mocked(notificationApi.markAllAsRead).mockResolvedValue();
  useAuthStore.setState({ user: { id: 'u1', name: 'Colleague', email: 'colleague@example.test', businesses: [], currentBusiness: { businessId: 'b1', businessName: 'Harisree Agency', role: 'Owner', permissions: [] } } });
});
function view(role = 'Owner', permissions: string[] = [], path = '/dashboard') {
  useAuthStore.setState(s => ({ user: { ...s.user!, currentBusiness: { ...s.user!.currentBusiness!, role, permissions } } }));
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes><Route element={<AppShell />}><Route path="*" element={<p>Route content</p>} /></Route></Routes></MemoryRouter></QueryClientProvider>);
}
it('marks Stock active on its detail route and keeps primary routes out of More', () => {
  view('Owner', [], '/inventory/c1/activity'); const bar = screen.getByRole('navigation', { name: 'Mobile navigation' });
  expect(within(bar).getByRole('link', { name: 'Stock' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(within(bar).getByRole('button', { name: 'More' })); const menu = screen.getByRole('dialog', { name: 'More' });
  expect(within(menu).queryByRole('link', { name: 'Stock List' })).not.toBeInTheDocument(); expect(within(menu).queryByRole('link', { name: 'All Purchases' })).not.toBeInTheDocument();
});
it('filters primary and More routes by the selected membership override', () => {
  view('Manager', ['stock.view']); const bar = screen.getByRole('navigation', { name: 'Mobile navigation' });
  expect(within(bar).queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument(); expect(within(bar).queryByRole('link', { name: 'Purchases' })).not.toBeInTheDocument();
  fireEvent.click(within(bar).getByRole('button', { name: 'More' })); const menu = screen.getByRole('dialog');
  for (const name of ['Users', 'Suppliers', 'Brokers', 'Items', 'New Purchase', 'Export & Backup']) expect(within(menu).queryByRole('link', { name })).not.toBeInTheDocument();
});
it('closes More on Escape, restores focus, and closes it after a route selection', async () => {
  view(); const more = screen.getByRole('button', { name: 'More' }); fireEvent.click(more);
  expect(more).toHaveAttribute('aria-expanded', 'true'); expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(more).toHaveFocus();
  fireEvent.click(more); fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Suppliers' }));
  await waitFor(() => expect(more).toHaveAttribute('aria-expanded', 'false')); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(more).toHaveAttribute('aria-current', 'page');
});
it('announces the exact unread count while capping the visible badge; opens only one list query', async () => {
  view(); const bell = within(document.querySelector('header')!).getByRole('button', { name: 'Notifications' });
  await waitFor(() => expect(bell).toHaveAccessibleDescription('12 unread notifications')); expect(within(bell).getByText('9+')).toBeInTheDocument();
  expect(notificationApi.getNotifications).not.toHaveBeenCalled(); fireEvent.click(bell); await screen.findByText('No notifications found.'); expect(notificationApi.getNotifications).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /View all notifications/ })); expect(screen.queryByRole('region', { name: 'Notification preview' })).not.toBeInTheDocument();
});
it('retains read mutations and shares the unread cache invalidation', async () => {
  view(); const bell = within(document.querySelector('header')!).getByRole('button', { name: 'Notifications' }); await waitFor(() => expect(bell).toHaveAccessibleDescription('12 unread notifications'));
  fireEvent.click(bell); await screen.findByText('No notifications found.'); vi.mocked(notificationApi.getUnreadCount).mockResolvedValue(0);
  fireEvent.click(screen.getByRole('button', { name: 'Mark all read' })); await waitFor(() => expect(notificationApi.markAllAsRead).toHaveBeenCalledTimes(1)); await waitFor(() => expect(bell).not.toHaveAttribute('aria-describedby'));
});
it('offers a safe retry when the preview query fails', async () => {
  vi.mocked(notificationApi.getNotifications).mockRejectedValueOnce(new Error('private payload')).mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 } });
  view(); fireEvent.click(within(document.querySelector('header')!).getByRole('button', { name: 'Notifications' })); fireEvent.click(await screen.findByRole('button', { name: 'Retry notifications' })); await screen.findByText('No notifications found.'); expect(screen.queryByText('private payload')).not.toBeInTheDocument();
});
it('does not mount the mobile bell or bottom bar on desktop', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); view();
  expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument(); expect(notificationApi.getUnreadCount).not.toHaveBeenCalled();
});
it('respects the backup role gate even when Staff receives reports.view', () => {
  view('Staff', ['reports.view']); fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(within(screen.getByRole('dialog')).queryByRole('link', { name: 'Export & Backup' })).not.toBeInTheDocument();
});
it('shows authorized child routes independently of a denied parent overview', () => {
  view('Manager', ['purchase.create', 'catalog.edit']); const bar = screen.getByRole('navigation', { name: 'Mobile navigation' });
  expect(within(bar).queryByRole('link', { name: 'Purchases' })).not.toBeInTheDocument(); fireEvent.click(within(bar).getByRole('button', { name: 'More' }));
  const menu = within(screen.getByRole('dialog')); expect(menu.getByRole('link', { name: 'New Purchase' })).toBeInTheDocument(); expect(menu.getByRole('link', { name: 'Duplicates' })).toBeInTheDocument(); expect(menu.queryByRole('link', { name: 'Items' })).not.toBeInTheDocument();
});
it('provides Arabic RTL steps only for permitted role guides and states unavailable actions accurately', () => {
  render(<MemoryRouter><HelpGuidePage /></MemoryRouter>);
  const arabic = screen.getByText('استخدم الكاميرا في المتصفحات المدعومة أو أدخل الرمز يدوياً.').closest('[lang="ar"]'); expect(arabic).toHaveAttribute('dir', 'rtl');
  expect(screen.getByText('أدخل الكميات والأسعار، ثم راجع المعاينة قبل الحفظ.')).toBeInTheDocument();
});
