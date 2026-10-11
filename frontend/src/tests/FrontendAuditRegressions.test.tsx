import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '../components/ui/ToastProvider';
import { useAuthStore } from '../stores/authStore';
import { catalogApi } from '../api/catalogApi';
import { stockApi } from '../api/stockApi';
import { dashboardApi } from '../api/dashboardApi';
import { purchaseApi, PurchaseStatus } from '../api/purchaseApi';
import DuplicateReview from '../pages/catalog/DuplicateReview';
import StockDashboard from '../pages/stock/StockDashboard';
import StockActivity from '../pages/stock/StockActivity';
import StockDetail from '../pages/stock/StockDetail';
import PurchaseDashboard from '../pages/purchases/PurchaseDashboard';
import PurchaseDetail from '../pages/purchases/PurchaseDetail';

vi.mock('../api/catalogApi', () => ({ catalogApi: { getDuplicateCandidates: vi.fn(), getItemById: vi.fn(), archiveItem: vi.fn(), deleteItem: vi.fn() } }));
vi.mock('../api/stockApi', () => ({ stockApi: { getItems: vi.fn(), getLowStock: vi.fn(), getOutOfStock: vi.fn(), getDetail: vi.fn(), getActivity: vi.fn(), adjustStock: vi.fn() } }));
vi.mock('../api/dashboardApi', () => ({ dashboardApi: { getDashboard: vi.fn() } }));
vi.mock('../api/purchaseApi', async original => ({ ...await original<typeof import('../api/purchaseApi')>(), purchaseApi: { getPurchaseById: vi.fn(), getPurchases: vi.fn(), receiveItems: vi.fn(), getActivity: vi.fn() } }));
vi.mock('../components/damage/DamageReportSection', () => ({ default: () => null }));
vi.mock('../components/WhatsAppDelivery', () => ({ WhatsAppDelivery: () => null }));
vi.mock('../components/ServerDownload', () => ({ ServerDownload: () => null }));
vi.mock('../pages/purchases/PurchasePayment', () => ({ default: () => null }));
const item = { id: 'c1', name: 'Rice', itemCode: 'R1', defaultUnit: 'KG', systemStock: 10, physicalStock: 9, reservedStock: 0, availableStock: 10, rowVersion: 'latest-version', isActive: true };
const order = { id: 'p1', orderNumber: 'PO-1', version: 7, status: PurchaseStatus.Verified, supplierName: 'Supplier', createdAt: '2026-10-02T00:00:00Z', items: [{ id: 'pi1', catalogItemId: 'c1', catalogItemName: 'Rice', itemCode: 'R1', orderedQuantity: 10, receivedQuantity: 3 }] };
const paged = (data: unknown[], page = 1, total = data.length) => ({ data, meta: { page, pageSize: 50, totalCount: total, totalPages: Math.ceil(total / 50) } });
function view(node: ReactNode, path = '/') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); const invalidate = vi.spyOn(cache, 'invalidateQueries');
  render(<QueryClientProvider client={cache}><ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={node} /><Route path="/inventory/:id" element={node} /><Route path="/purchases/:id" element={node} /></Routes></MemoryRouter></ToastProvider></QueryClientProvider>); return invalidate;
}
beforeEach(() => {
  vi.resetAllMocks(); useAuthStore.setState({ user: { id: 'owner', currentBusiness: { role: 'Owner', permissions: [] } } as never });
  vi.mocked(stockApi.getItems).mockResolvedValue(paged([]) as never); vi.mocked(stockApi.getLowStock).mockResolvedValue(paged([]) as never); vi.mocked(stockApi.getOutOfStock).mockResolvedValue(paged([]) as never);
  vi.mocked(stockApi.getDetail).mockResolvedValue(item as never); vi.mocked(purchaseApi.getPurchaseById).mockResolvedValue(order as never); vi.mocked(purchaseApi.getActivity).mockResolvedValue([]);
  vi.mocked(purchaseApi.receiveItems).mockResolvedValue(order as never);
  vi.mocked(catalogApi.getDuplicateCandidates).mockResolvedValue([{ itemAId: 'c1', itemBId: 'c2', itemAName: 'Rice', itemBName: 'Rice duplicate', similarityScore: 90, matchReasons: ['name'] }] as never);
  vi.mocked(catalogApi.getItemById).mockResolvedValue(item as never);
});
it('archives a duplicate with its latest version and never deletes it', async () => {
  const invalidate = view(<DuplicateReview />); fireEvent.click(await screen.findByRole('button', { name: 'Archive Item B' })); fireEvent.click(screen.getByRole('button', { name: /^Archive$/ }));
  await waitFor(() => expect(catalogApi.archiveItem).toHaveBeenCalledWith('c2', 'latest-version')); expect(catalogApi.deleteItem).not.toHaveBeenCalled(); expect(invalidate).toHaveBeenCalledWith({ queryKey: ['search'] });
});
it('does not offer duplicate archival without archive permission', async () => {
  useAuthStore.setState({ user: { currentBusiness: { role: 'Manager', permissions: ['catalog.edit'] } } as never }); view(<DuplicateReview />); await screen.findByText('Rice duplicate'); expect(screen.queryByRole('button', { name: 'Archive Item B' })).not.toBeInTheDocument();
});
it('shows failed low-stock data as unavailable and retry restores the actual count', async () => {
  vi.mocked(stockApi.getLowStock).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(paged([item]) as never); view(<StockDashboard />);
  await screen.findByText('Low-stock alerts could not be loaded.'); expect(screen.getByText('Unavailable')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findByText('Rice'); expect(stockApi.getLowStock).toHaveBeenCalledTimes(2);
});
it('retrieves older stock activity with real pagination', async () => {
  vi.mocked(stockApi.getActivity).mockImplementation(async (_id, page) => paged([{ id: String(page), movementType: 'AdjustmentIncrease', quantityDelta: 1, quantityBefore: 9, quantityAfter: 10, reason: 'Page ' + page, createdAt: '2026-10-02' }], page, 51) as never);
  view(<StockActivity />, '/inventory/c1'); await screen.findByText('Page 1'); fireEvent.click(screen.getByRole('button', { name: 'Next page' })); await screen.findByText('Page 2'); expect(stockApi.getActivity).toHaveBeenCalledWith('c1', 2, 50);
});
it('offers retry for a stock network failure instead of saying the item does not exist', async () => {
  vi.mocked(stockApi.getDetail).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(item as never); view(<StockDetail />, '/inventory/c1'); await screen.findByRole('alert'); expect(screen.queryByText('Item not found')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findByRole('heading', { name: 'Rice' }); expect(stockApi.adjustStock).not.toHaveBeenCalled();
});
it('uses authoritative purchase aggregates beyond the first 100 orders', async () => {
  vi.mocked(dashboardApi.getDashboard).mockResolvedValue({ deliveryMetrics: { draftPurchases: 250, confirmedPurchases: 140, dispatchedPurchases: 10, arrivedPurchases: 2 }, purchaseMetrics: { totalPurchaseSpend: 12345.5 }, recentPurchases: [] } as never);
  view(<PurchaseDashboard />); await screen.findByText('250'); expect(screen.getByText('140')).toBeInTheDocument(); expect(screen.getByText('12')).toBeInTheDocument(); expect(screen.getByText('₹12,345.50')).toBeInTheDocument(); expect(purchaseApi.getPurchases).not.toHaveBeenCalled();
});
it('never fabricates zero spend when financial data is redacted', async () => {
  vi.mocked(dashboardApi.getDashboard).mockResolvedValue({ deliveryMetrics: { draftPurchases: 1, confirmedPurchases: 1, dispatchedPurchases: 0, arrivedPurchases: 0 }, purchaseMetrics: {}, recentPurchases: [] } as never);
  view(<PurchaseDashboard />); await screen.findByText('No purchase orders found'); expect(screen.getByText('Unavailable with your access')).toBeInTheDocument(); expect(screen.queryByText('₹0.00')).not.toBeInTheDocument();
});
it('does not commit stock from an empty receipt; explicit Fill All receives only the remainder', async () => {
  view(<PurchaseDetail />, '/purchases/p1'); const commit = await screen.findByRole('button', { name: 'Commit Received Items to Stock' }); fireEvent.click(commit);
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a positive received quantity'); expect(purchaseApi.receiveItems).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Fill All' })); fireEvent.click(commit); await screen.findByText('Received quantities saved.');
  expect(purchaseApi.receiveItems).toHaveBeenCalledExactlyOnceWith('p1', { expectedVersion: 7, items: [{ purchaseItemId: 'pi1', receivedQuantityDelta: 7, notes: undefined }] });
});
it('hides stock receipt controls from viewers without both verify and commit permissions', async () => {
  useAuthStore.setState({ user: { currentBusiness: { role: 'Staff', permissions: ['purchase.view', 'purchase.verify'] } } as never }); view(<PurchaseDetail />, '/purchases/p1'); await screen.findByRole('heading', { name: 'PO-1' }); expect(screen.queryByRole('button', { name: 'Commit Received Items to Stock' })).not.toBeInTheDocument(); expect(purchaseApi.receiveItems).not.toHaveBeenCalled();
});
