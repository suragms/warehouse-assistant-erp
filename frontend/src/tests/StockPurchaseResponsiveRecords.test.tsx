import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import { stockApi } from '../api/stockApi';
import { supplierApi } from '../api/supplierApi';
import { purchaseApi, PurchaseStatus, DeliveryState } from '../api/purchaseApi';
import StockList from '../pages/stock/StockList';
import PurchaseList from '../pages/purchases/PurchaseList';
import PurchaseDetail from '../pages/purchases/PurchaseDetail';

vi.mock('../layouts/useMobileViewport', () => ({ useMobileViewport: () => true }));
vi.mock('../api/apiClient', () => ({ default: { get: vi.fn(async () => ({ data: { categories: [], suppliers: [] } })) } }));
vi.mock('../api/stockApi', () => ({ stockApi: { getItems: vi.fn(), getLowStock: vi.fn(), getOutOfStock: vi.fn(), adjustStock: vi.fn() } }));
vi.mock('../api/supplierApi', () => ({ supplierApi: { getSuppliers: vi.fn() } }));
vi.mock('../api/purchaseApi', async original => ({ ...await original<typeof import('../api/purchaseApi')>(), purchaseApi: {
  getPurchaseById: vi.fn(), getPurchases: vi.fn(), receiveItems: vi.fn(), getActivity: vi.fn(), updateStatus: vi.fn(), deletePurchase: vi.fn(),
} }));
vi.mock('../components/damage/DamageReportSection', () => ({ default: () => null }));
vi.mock('../components/WhatsAppDelivery', () => ({ WhatsAppDelivery: () => null }));
vi.mock('../components/ServerDownload', () => ({ ServerDownload: () => null }));
vi.mock('../components/CsvExportButton', () => ({ CsvExportButton: () => null }));
vi.mock('../pages/purchases/PurchasePayment', () => ({ default: () => null }));

const stock = { id: 'c1', name: 'Long warehouse product name for mobile', itemCode: 'SKU-42', barcode: 'ABC123', categoryName: 'Dry goods',
  defaultUnit: 'KG', systemStock: 100, physicalStock: 98, reservedStock: 10, availableStock: 90, reorderLevel: 95, rowVersion: 'v1', isActive: true };
const order = { id: 'p1', orderNumber: 'PO-1001', version: 7, status: PurchaseStatus.Draft, deliveryState: DeliveryState.Partial, supplierName: 'Long supplier name',
  supplierId: 's1', createdAt: '2026-10-02T00:00:00Z', subtotal: 150, taxTotal: 0, grandTotal: 150, remainingAmount: 150, items: [{ id: 'pi1', catalogItemId: 'c1', catalogItemName: stock.name,
    itemCode: stock.itemCode, unit: 'KG', orderedQuantity: 10, receivedQuantity: 3, unitPrice: 15, lineTotal: 150 }] };
const paged = <T,>(data: T[]) => ({ data, meta: { page: 1, pageSize: 20, totalCount: data.length, totalPages: 1 } });
const copy = vi.fn();
function view(node: ReactNode, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/inventory/all" element={node} /><Route path="/purchases/list" element={node} /><Route path="/purchases/:id" element={node} />
  </Routes></MemoryRouter></QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.resetAllMocks(); useAuthStore.setState({ user: { id: 'owner', currentBusiness: { role: 'Owner', permissions: [] } } as never });
  vi.mocked(stockApi.getItems).mockResolvedValue(paged([stock]));
  vi.mocked(supplierApi.getSuppliers).mockResolvedValue(paged([]));
  vi.mocked(purchaseApi.getPurchases).mockResolvedValue(paged([order]) as never);
  vi.mocked(purchaseApi.getPurchaseById).mockResolvedValue(order as never);
  vi.mocked(purchaseApi.getActivity).mockResolvedValue([]);
  vi.mocked(purchaseApi.receiveItems).mockResolvedValue(order as never);
  vi.mocked(purchaseApi.updateStatus).mockResolvedValue(order as never);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  copy.mockResolvedValue(undefined);
});

it('renders every inventory quantity, identifier and stock action in a mobile card without a squeezed table', async () => {
  view(<StockList />, '/inventory/all'); await screen.findByRole('heading', { name: stock.name });
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  for (const text of ['SKU-42', 'ABC123', 'Dry goods', '100 KG', '98 KG', '10 KG', '90 KG', '95 KG', 'Low stock']) expect(screen.getByText(text)).toBeVisible();
  expect(screen.getByRole('link', { name: `View stock for ${stock.name}` })).toHaveAttribute('href', '/inventory/c1');
  expect(stockApi.adjustStock).not.toHaveBeenCalled();
});

it('preserves mobile purchase selection, select-all and copying only the selected real rows', async () => {
  const second = { ...order, id: 'p2', orderNumber: 'PO-1002' };
  vi.mocked(purchaseApi.getPurchases).mockResolvedValue(paged([order, second]) as never);
  view(<PurchaseList />, '/purchases/list'); await screen.findByRole('heading', { name: 'PO-1001' });
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  const button = screen.getByRole('button', { name: 'Copy selected CSV' }); expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select PO-1001' })); fireEvent.click(button);
  await screen.findByText('Selected purchases copied as CSV.'); expect(copy.mock.calls[0][0]).toContain('PO-1001'); expect(copy.mock.calls[0][0]).not.toContain('PO-1002');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all purchases on this page' }));
  expect(screen.getByRole('checkbox', { name: 'Select PO-1002' })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all purchases on this page' })); expect(button).toBeDisabled();
});

it.each([
  ['Search purchase orders', 'rice', 'rice', undefined, undefined, false],
  ['Filter purchase status', String(PurchaseStatus.Confirmed), undefined, PurchaseStatus.Confirmed, undefined, true],
  ['Filter supplier', 's1', undefined, undefined, 's1', false],
] as const)('clears purchase selection and copy feedback when %s changes', async (label, value, search, status, supplier, failCopy) => {
  vi.mocked(supplierApi.getSuppliers).mockResolvedValue(paged([{ id: 's1', name: 'Supplier one' }]) as never);
  if (failCopy) copy.mockRejectedValueOnce(new Error('Clipboard unavailable'));
  view(<PurchaseList />, '/purchases/list');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select PO-1001' }));
  const button = screen.getByRole('button', { name: 'Copy selected CSV' }); fireEvent.click(button);
  await screen.findByText(failCopy ? 'Selected purchases could not be copied. Refresh the list and try again.' : 'Selected purchases copied as CSV.');
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await waitFor(() => expect(purchaseApi.getPurchases).toHaveBeenLastCalledWith(1, 20, search, status, supplier));
  expect(await screen.findByRole('checkbox', { name: 'Select PO-1001' })).not.toBeChecked();
  expect(button).toBeDisabled(); expect(screen.queryByText(/Selected purchases (copied|could not be copied)/)).not.toBeInTheDocument();
  fireEvent.click(button); expect(copy).toHaveBeenCalledTimes(1);
});

it('clears selections and prior feedback when moving to the next and previous purchase pages', async () => {
  const second = { ...order, id: 'p2', orderNumber: 'PO-1002' };
  vi.mocked(purchaseApi.getPurchases).mockImplementation(async page => ({ data: [page === 2 ? second : order], meta: { page: page ?? 1, pageSize: 20, totalCount: 21, totalPages: 2 } }) as never);
  view(<PurchaseList />, '/purchases/list');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select PO-1001' }));
  const button = screen.getByRole('button', { name: 'Copy selected CSV' }); fireEvent.click(button);
  await screen.findByText('Selected purchases copied as CSV.'); fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  const secondCheckbox = await screen.findByRole('checkbox', { name: 'Select PO-1002' });
  expect(secondCheckbox).not.toBeChecked(); expect(button).toBeDisabled(); expect(screen.queryByText('Selected purchases copied as CSV.')).not.toBeInTheDocument();
  fireEvent.click(secondCheckbox); expect(button).toBeEnabled(); fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(await screen.findByRole('checkbox', { name: 'Select PO-1001' })).not.toBeChecked(); expect(button).toBeDisabled();
  fireEvent.click(button); expect(copy).toHaveBeenCalledTimes(1);
});

it('prevents header-only CSV copying when a refresh removes the selected purchase', async () => {
  const client = view(<PurchaseList />, '/purchases/list');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select PO-1001' }));
  const button = screen.getByRole('button', { name: 'Copy selected CSV' }); expect(button).toBeEnabled();
  vi.mocked(purchaseApi.getPurchases).mockResolvedValue(paged([{ ...order, id: 'p2', orderNumber: 'PO-1002' }]) as never);
  await act(async () => { await client.invalidateQueries({ queryKey: ['purchases'] }); });
  await screen.findByRole('checkbox', { name: 'Select PO-1002' }); expect(button).toBeDisabled();
  fireEvent.click(button); expect(copy).not.toHaveBeenCalled(); expect(screen.queryByText('Selected purchases copied as CSV.')).not.toBeInTheDocument();
});

it.each([false, true])('does not restore stale copy feedback after a filter change while copying (failure=%s)', async failCopy => {
  let finish!: () => void;
  copy.mockImplementationOnce(() => new Promise<void>((resolve, reject) => { finish = () => failCopy ? reject(new Error('Clipboard unavailable')) : resolve(); }));
  view(<PurchaseList />, '/purchases/list');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select PO-1001' }));
  const button = screen.getByRole('button', { name: 'Copy selected CSV' }); fireEvent.click(button);
  expect(copy).toHaveBeenCalledOnce(); fireEvent.change(screen.getByLabelText('Search purchase orders'), { target: { value: 'rice' } });
  await act(async () => { finish(); });
  expect(await screen.findByRole('checkbox', { name: 'Select PO-1001' })).not.toBeChecked(); expect(button).toBeDisabled();
  expect(screen.queryByText(/Selected purchases (copied|could not be copied)/)).not.toBeInTheDocument();
});

it('keeps the authorized versioned confirmation action available on mobile', async () => {
  view(<PurchaseList />, '/purchases/list'); fireEvent.click(await screen.findByRole('button', { name: 'Confirm PO-1001' }));
  await waitFor(() => expect(purchaseApi.updateStatus).toHaveBeenCalledWith('p1', PurchaseStatus.Confirmed, 7));
  expect(screen.getByText('Partial')).toBeVisible(); expect(screen.getByText('₹150.00')).toBeVisible();
  expect(purchaseApi.receiveItems).not.toHaveBeenCalled();
});

it('keeps bulk financial selection and restricted mutations hidden from a purchase viewer on mobile', async () => {
  useAuthStore.setState({ user: { currentBusiness: { role: 'Staff', permissions: ['purchase.view'] } } as never });
  view(<PurchaseList />, '/purchases/list'); await screen.findByRole('heading', { name: 'PO-1001' });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm PO-1001' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'View PO-1001' })).toBeVisible();
});

it('keeps mobile receipt inputs unique and commits only explicitly entered quantities with the loaded version', async () => {
  vi.mocked(purchaseApi.getPurchaseById).mockResolvedValue({ ...order, status: PurchaseStatus.Verified } as never);
  view(<PurchaseDetail />, '/purchases/p1'); const input = await screen.findByRole('spinbutton', { name: `Receive quantity for ${stock.name}` });
  expect(screen.queryByRole('table')).not.toBeInTheDocument(); expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
  expect(screen.getByText('10 KG')).toBeVisible(); expect(screen.getByText('3 KG')).toBeVisible();
  expect(purchaseApi.receiveItems).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '2' } }); fireEvent.click(screen.getByRole('button', { name: 'Commit Received Items to Stock' }));
  await waitFor(() => expect(purchaseApi.receiveItems).toHaveBeenCalledExactlyOnceWith('p1', { expectedVersion: 7, items: [{ purchaseItemId: 'pi1', receivedQuantityDelta: 2, notes: undefined }] }));
});
