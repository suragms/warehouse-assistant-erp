import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';
import { dashboardApi } from '../api/dashboardApi';
import { useAuthStore } from '../stores/authStore';

vi.mock('../api/dashboardApi', () => ({ dashboardApi: { getDashboard: vi.fn() } }));
const supplier = 'Supplier with a very long business name & Unicode café';
const item = 'Industrial warehouse component with a long descriptive catalog name';
const data = {
  purchaseMetrics: { totalPurchaseSpend: 123.45, completedPurchasesCount: 2, activePurchasesCount: 3, todayPurchasesCount: 1, pendingPurchasesCount: 2 },
  stockMetrics: { lowStockCount: 1, outOfStockCount: 0, totalCatalogItems: 3, itermsWithPhysicalVariance: 1 },
  operationalAlerts: [],
  recentPurchases: [{ id: 'p1', orderNumber: 'PO-001', supplierName: supplier, status: 1, grandTotal: 123.45 }],
  recentStockActivity: [{ id: 'a1', catalogItemName: item, itemCode: 'SKU-001', movementType: 'Consumption', quantityDelta: -7, date: '2026-10-10T10:00:00Z' }],
};
function show(mobile: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={cache}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ user: { id: 'owner', currentBusiness: { role: 'Owner', permissions: [] } } as never });
  vi.mocked(dashboardApi.getDashboard).mockResolvedValue(data as never);
});
afterEach(() => vi.unstubAllGlobals());

it('keeps purchase identity, complete supplier, status, total and navigation in one mobile record', async () => {
  show(true);
  const purchases = await screen.findByRole('region', { name: 'Recent purchase orders' });
  expect(within(purchases).getByText(supplier)).toBeVisible();
  expect(within(purchases).getByText('Confirmed')).toBeVisible();
  expect(within(purchases).getByText('₹123.45')).toBeVisible();
  expect(within(purchases).getByRole('link', { name: 'PO-001' })).toHaveAttribute('href', '/purchases/p1');
  expect(within(purchases).getByRole('link', { name: 'View purchase' })).toHaveAttribute('href', '/purchases/p1');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  const activity = screen.getByRole('region', { name: 'Recent inventory activity' });
  expect(within(activity).getByText(item)).toBeVisible();
  expect(within(activity).getByText('SKU-001')).toBeVisible();
  expect(within(activity).getByText('Consumption')).toBeVisible();
  expect(within(activity).getByText('-7')).toBeVisible();
});

it('preserves comparison tables and keyboard purchase links on desktop', async () => {
  show(false);
  const purchases = await screen.findByRole('region', { name: 'Recent purchase orders table' });
  expect(within(purchases).getByRole('table')).toBeVisible();
  expect(within(purchases).getByText(supplier)).toBeVisible();
  expect(within(purchases).getByRole('link', { name: 'PO-001' })).toHaveAttribute('href', '/purchases/p1');
  expect(purchases).toHaveAttribute('tabindex', '0');
  expect(screen.getAllByRole('table')).toHaveLength(2);
});

it.each(['link', 'row'] as const)('adds one history entry when a desktop purchase %s is activated, so one Back returns to Dashboard', async target => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/dashboard', element: <Dashboard /> },
    { path: '/purchases/:id', element: <p>Purchase detail</p> },
  ], { initialEntries: ['/dashboard'] });
  render(<QueryClientProvider client={cache}><RouterProvider router={router} /></QueryClientProvider>);
  const link = await screen.findByRole('link', { name: 'PO-001' });
  fireEvent.click(target === 'link' ? link : link.closest('tr')!);
  await screen.findByText('Purchase detail');
  await act(async () => { await router.navigate(-1); });
  expect(router.state.location.pathname).toBe('/dashboard');
  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

it('preserves permissions and hides financial data and creation from a stock-only staff member', async () => {
  useAuthStore.setState({ user: { id: 'staff', currentBusiness: { role: 'Staff', permissions: ['stock.view'] } } as never });
  show(true);
  await screen.findByRole('region', { name: 'Recent inventory activity' });
  expect(screen.queryByRole('region', { name: 'Recent purchase orders' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New Purchase' })).not.toBeInTheDocument();
  expect(screen.queryByText('₹123.45')).not.toBeInTheDocument();
});
