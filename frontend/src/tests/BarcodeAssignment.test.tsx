import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import BarcodeAssignment from '../components/BarcodeAssignment';
import BarcodeManager from '../pages/catalog/BarcodeManager';
import { catalogApi, type CatalogItem } from '../api/catalogApi';
import { useAuthStore } from '../stores/authStore';

vi.mock('../api/catalogApi', () => ({ catalogApi: { assignBarcode: vi.fn(), generateBarcode: vi.fn(), getItemById: vi.fn(), lookupByBarcode: vi.fn(), getItems: vi.fn() } }));
const item: CatalogItem = { id: 'c1', itemCode: 'R01', name: 'Rice', barcode: 'OLD', rowVersion: 'v1', categoryId: 'food', categoryName: 'Food', defaultUnit: 'KG', reorderLevel: 2, currentStock: 25, isActive: true };
const updated = { ...item, barcode: 'NEW', rowVersion: 'v2' };
const wrap = (element: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<MemoryRouter><QueryClientProvider client={client}>{element}</QueryClientProvider></MemoryRouter>);
  return invalidate;
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    font: '', measureText: (text: string) => ({ width: text.length * 8 }),
  }) as unknown as CanvasRenderingContext2D);
  useAuthStore.setState({ user: { currentBusiness: { businessId: 'b1', role: 'Owner', permissions: [] } } as never });
  vi.mocked(catalogApi.assignBarcode).mockResolvedValue(updated);
  vi.mocked(catalogApi.generateBarcode).mockResolvedValue({ ...updated, barcode: 'WA-1234' });
  vi.mocked(catalogApi.getItemById).mockResolvedValue(updated);
});
it('assigns only barcode and loaded version and invalidates both lookup directions and search', async () => {
  const changed = vi.fn(); const invalidate = wrap(<BarcodeAssignment item={item} onChanged={changed} />);
  fireEvent.change(screen.getByLabelText('New Barcode'), { target: { value: ' NEW ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Barcode' }));
  await screen.findByText('Barcode saved. Stock is unchanged.');
  expect(catalogApi.assignBarcode).toHaveBeenCalledExactlyOnceWith('c1', 'NEW', 'v1');
  expect(changed).toHaveBeenCalledWith(updated);
  for (const key of [['barcode'], ['catalog'], ['search'], ['stock'], ['duplicates']]) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
});
it('clears explicitly and generates only for items without a barcode', async () => {
  wrap(<BarcodeAssignment item={item} />);
  expect(screen.queryByRole('button', { name: 'Generate Barcode' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear Barcode' }));
  await screen.findByText('Barcode saved. Stock is unchanged.');
  expect(catalogApi.assignBarcode).toHaveBeenCalledWith('c1', null, 'v1');
});
it('generates a barcode for an existing item without creating an item', async () => {
  wrap(<BarcodeAssignment item={{ ...item, barcode: null }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate Barcode' }));
  await screen.findByText('Barcode saved. Stock is unchanged.');
  expect(catalogApi.generateBarcode).toHaveBeenCalledExactlyOnceWith('c1', 'v1');
  expect(catalogApi.assignBarcode).not.toHaveBeenCalled();
});
it.each([
  ['DUPLICATE_BARCODE', 'reserved by another item'],
  ['CATALOG_ITEM_VERSION_CONFLICT', 'This item changed'],
])('distinguishes %s and preserves unsaved input', async (code, message) => {
  vi.mocked(catalogApi.assignBarcode).mockRejectedValue({ response: { status: 409, data: { error: code } } });
  wrap(<BarcodeAssignment item={item} />);
  fireEvent.change(screen.getByLabelText('New Barcode'), { target: { value: 'NEW' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Barcode' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByLabelText('New Barcode')).toHaveValue('NEW');
  fireEvent.click(screen.getByRole('button', { name: 'Reload Item' }));
  await screen.findByText('Latest item loaded.'); expect(catalogApi.getItemById).toHaveBeenCalledWith('c1');
});
it('rejects unsupported encoding before a request and handles a network failure', async () => {
  vi.mocked(catalogApi.assignBarcode).mockRejectedValue(new Error('network'));
  wrap(<BarcodeAssignment item={item} />);
  fireEvent.change(screen.getByLabelText('New Barcode'), { target: { value: 'é' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Barcode' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('printable ASCII');
  expect(catalogApi.assignBarcode).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('New Barcode'), { target: { value: 'NEW' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Barcode' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection');
});
it('USB-style Enter does not submit an unrelated form or send repeated mutations', async () => {
  let resolve!: (value: CatalogItem) => void;
  vi.mocked(catalogApi.assignBarcode).mockReturnValue(new Promise(r => { resolve = r; }));
  const outerSubmit = vi.fn(e => e.preventDefault());
  wrap(<form onSubmit={outerSubmit}><BarcodeAssignment item={item} /></form>);
  const input = screen.getByLabelText('New Barcode'); fireEvent.change(input, { target: { value: 'NEW' } });
  fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.keyDown(input, { key: 'Enter' });
  expect(catalogApi.assignBarcode).toHaveBeenCalledTimes(1); expect(outerSubmit).not.toHaveBeenCalled();
  await act(async () => resolve(updated));
});
it('hides mutation controls without catalog.edit and refuses generation on archived items', () => {
  useAuthStore.setState({ user: { currentBusiness: { role: 'Staff', permissions: ['catalog.view'] } } as never });
  wrap(<BarcodeAssignment item={item} />); expect(screen.queryByLabelText('New Barcode')).not.toBeInTheDocument();
});
it('lookup shows SKU, unit and stock for an archived match without a mutation', async () => {
  useAuthStore.setState({ user: { currentBusiness: { role: 'Staff', permissions: ['catalog.view'] } } as never });
  vi.mocked(catalogApi.lookupByBarcode).mockResolvedValue({ ...item, isActive: false });
  wrap(<BarcodeManager />);
  fireEvent.change(screen.getByLabelText('Scan or enter barcode'), { target: { value: 'OLD' } });
  fireEvent.keyDown(screen.getByLabelText('Scan or enter barcode'), { key: 'Enter' });
  await screen.findByText('R01'); expect(screen.getByText('Current stock: 25 KG')).toBeInTheDocument();
  expect(screen.getByText(/This item is archived/)).toBeInTheDocument(); expect(catalogApi.assignBarcode).not.toHaveBeenCalled();
});
it('unknown barcode and network lookup failures have distinct retry feedback', async () => {
  useAuthStore.setState({ user: { currentBusiness: { role: 'Staff', permissions: ['catalog.view'] } } as never });
  vi.mocked(catalogApi.lookupByBarcode).mockRejectedValue({ response: { status: 404 } });
  wrap(<BarcodeManager />); const input = screen.getByLabelText('Scan or enter barcode');
  fireEvent.change(input, { target: { value: 'UNKNOWN' } }); fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByText('Unknown barcode');
  vi.mocked(catalogApi.lookupByBarcode).mockRejectedValue(new Error('network'));
  fireEvent.change(input, { target: { value: 'NETWORK' } }); fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(screen.getByText('Failed to lookup barcode. Please try again.')).toBeInTheDocument());
});
