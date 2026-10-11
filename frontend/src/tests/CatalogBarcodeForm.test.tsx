import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import CatalogForm from '../pages/catalog/CatalogForm';
import { catalogApi } from '../api/catalogApi';
import { catalogKeys } from '../lib/queryKeys';
import { ToastContext } from '../components/ui/toastContext';

vi.mock('../api/catalogApi', () => ({ catalogApi: { getCategories: vi.fn(), getItemById: vi.fn(), createItem: vi.fn(), updateItem: vi.fn() } }));
vi.mock('../api/apiClient', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }) } }));
const item = { id: 'c1', name: 'Rice', itemCode: 'R01', barcode: 'OLD', categoryId: 'food', categoryName: 'Food', defaultUnit: 'KG', reorderLevel: 2, currentStock: 25, isActive: true, rowVersion: 'v1' };
const mount = (edit = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MemoryRouter initialEntries={[edit ? '/catalog/items/c1/edit' : '/catalog/items/new']}><QueryClientProvider client={client}>
    <ToastContext.Provider value={{ showToast: vi.fn() }}><Routes>
      <Route path="/catalog/items/new" element={<CatalogForm />} />
      <Route path="/catalog/items/:id/edit" element={<CatalogForm edit />} />
      <Route path="/catalog/items/:id" element={<p>Item saved</p>} />
    </Routes></ToastContext.Provider>
  </QueryClientProvider></MemoryRouter>);
  return client;
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(catalogApi.getCategories).mockResolvedValue([{ id: 'food', name: 'Food', itemCount: 1 }]);
  vi.mocked(catalogApi.getItemById).mockResolvedValue(item);
  vi.mocked(catalogApi.createItem).mockResolvedValue(item);
  vi.mocked(catalogApi.updateItem).mockResolvedValue(item);
});
it('create accepts a trimmed barcode, keeps it textual and scanner Enter cannot submit the form', async () => {
  mount(); await screen.findByRole('option', { name: 'Food' });
  fireEvent.change(screen.getByLabelText('Item Name *'), { target: { value: 'Rice' } });
  fireEvent.change(screen.getByLabelText('Item Code *'), { target: { value: 'R01' } });
  fireEvent.change(screen.getByLabelText('Category *'), { target: { value: 'food' } });
  fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: ' 00123 ' } });
  fireEvent.keyDown(screen.getByLabelText('Barcode'), { key: 'Enter' });
  expect(catalogApi.createItem).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Create Item' }));
  await screen.findByText('Item saved');
  expect(catalogApi.createItem).toHaveBeenCalledWith(expect.objectContaining({ barcode: '00123' }));
  expect(catalogApi.createItem).toHaveBeenCalledWith(expect.not.objectContaining({ currentStock: expect.anything() }));
});
it('edit clears with explicit null and the loaded version without sending stock', async () => {
  mount(true); const barcode = await screen.findByLabelText('Barcode');
  fireEvent.change(barcode, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Item saved');
  expect(catalogApi.updateItem).toHaveBeenCalledWith('c1', expect.objectContaining({ barcode: null, rowVersion: 'v1' }));
  expect(catalogApi.updateItem).toHaveBeenCalledWith('c1', expect.not.objectContaining({ currentStock: expect.anything() }));
});
it('edit shows duplicate barcode feedback and preserves unsaved input', async () => {
  vi.mocked(catalogApi.updateItem).mockRejectedValue({ normalized: 'DUPLICATE_BARCODE', response: { data: { error: 'DUPLICATE_BARCODE' } } });
  mount(true); const barcode = await screen.findByLabelText('Barcode');
  fireEvent.change(barcode, { target: { value: 'TAKEN' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('reserved by another item');
  expect(screen.getByLabelText('Barcode')).toHaveValue('TAKEN');
});

it('retains a catalog edit and its original version when a background query refreshes', async () => {
  const client = mount(true); const name = await screen.findByLabelText('Item Name *');
  fireEvent.change(name, { target: { value: 'My unsaved name' } });
  await act(async () => { client.setQueryData(catalogKeys.detail('c1'), { ...item, name: 'Another user name', rowVersion: 'v2' }); });
  expect(name).toHaveValue('My unsaved name'); fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Item saved'); expect(catalogApi.updateItem).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'My unsaved name', rowVersion: 'v1' }));
});
it('explicit conflict reload discards the draft and loads the current version', async () => {
  vi.mocked(catalogApi.updateItem).mockRejectedValue({ response: { status: 409, data: { error: { code: 'CATALOG_ITEM_VERSION_CONFLICT' } } } });
  mount(true); const name = await screen.findByLabelText('Item Name *'); fireEvent.change(name, { target: { value: 'My draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' })); await screen.findByRole('dialog', { name: 'Version Conflict' });
  vi.mocked(catalogApi.getItemById).mockResolvedValue({ ...item, name: 'Latest name', rowVersion: 'v2' });
  fireEvent.click(screen.getByRole('button', { name: 'Reload Latest' })); await waitFor(() => expect(screen.getByLabelText('Item Name *')).toHaveValue('Latest name'));
});
