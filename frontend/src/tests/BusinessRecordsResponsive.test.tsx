import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/ToastProvider';
import { useAuthStore } from '../stores/authStore';
import { catalogApi } from '../api/catalogApi';
import { usersApi } from '../api/usersApi';
import CatalogList from '../pages/catalog/CatalogList';
import SupplierList from '../pages/suppliers/SupplierList';
import BrokerList from '../pages/brokers/BrokerList';
import UsersPage from '../pages/users/UsersPage';

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock('../layouts/useMobileViewport', () => ({ useMobileViewport: () => viewport.mobile }));
vi.mock('../api/catalogApi', () => ({ catalogApi: { getItems: vi.fn(), getCategories: vi.fn(), getSuppliers: vi.fn(), getBrokers: vi.fn(), getSupplierItems: vi.fn(), updateBroker: vi.fn() } }));
vi.mock('../api/usersApi', async original => ({ ...await original<typeof import('../api/usersApi')>(), usersApi: { getUsers: vi.fn() } }));
vi.mock('../components/BarcodeTools', () => ({ BarcodeLabels: ({ items }: { items: { name: string }[] }) => <div aria-label="Selected labels">{items.map(item => item.name).join(', ')}</div> }));
vi.mock('../components/CsvExportButton', () => ({ CsvExportButton: () => <button type="button">Purchase CSV</button> }));
vi.mock('../components/users/PermissionEditor', () => ({ PermissionEditor: ({ userName }: { userName: string }) => <div role="dialog" aria-label={`Permissions for ${userName}`} /> }));

const item = { id: 'c1', name: 'Long catalog item name in a single readable record', itemCode: 'SKU-001', barcode: '123456789012', categoryName: 'Grains', currentStock: 12.5, defaultUnit: 'KG', isActive: true };
function view(node: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ToastProvider><MemoryRouter>{node}</MemoryRouter></ToastProvider></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); viewport.mobile = true;
  useAuthStore.setState({ user: { id: 'owner', currentBusiness: { role: 'Owner', businessName: 'Warehouse', permissions: [] } } as never });
  vi.mocked(catalogApi.getItems).mockResolvedValue({ data: [item, { ...item, id: 'c2', name: 'Archived item', isActive: false }], meta: { page: 1, pageSize: 50, totalCount: 2, totalPages: 1 } } as never);
  vi.mocked(catalogApi.getCategories).mockResolvedValue([]);
  vi.mocked(catalogApi.getSuppliers).mockResolvedValue([{ id: 's1', name: 'Supplier one', phone: '123456', linkedItemsCount: 2, isActive: true }] as never);
  vi.mocked(catalogApi.getSupplierItems).mockResolvedValue([]);
  vi.mocked(catalogApi.getBrokers).mockResolvedValue([{ id: 'b1', name: 'Broker one', linkedSuppliersCount: 3, isActive: true }] as never);
  vi.mocked(usersApi.getUsers).mockResolvedValue([{ id: 'staff', name: 'Staff person', email: 'staff@warehouse.example', role: 4, status: 0, createdAt: '2026-10-01' }]);
});

it('mobile catalog cards preserve stock, links, batch label selection and archived restrictions', async () => {
  view(<CatalogList />); const region = await screen.findByRole('region', { name: 'Catalog items' });
  expect(within(region).queryByRole('table')).not.toBeInTheDocument();
  expect(within(region).getByRole('link', { name: item.name })).toHaveAttribute('href', '/catalog/items/c1');
  expect(within(region).getAllByText('12.5 KG')).toHaveLength(2);
  const checkbox = within(region).getByRole('checkbox', { name: `Print label for ${item.name}` });
  fireEvent.click(checkbox); expect(screen.getByLabelText('Selected labels')).toHaveTextContent(item.name);
  expect(within(region).getByRole('checkbox', { name: 'Print label for Archived item' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search catalog items' }), { target: { value: 'rice' } });
  expect(screen.getByLabelText('Selected labels')).toHaveTextContent('');
  await waitFor(() => expect(catalogApi.getItems).toHaveBeenCalledWith(1, 50, 'rice', undefined));
});

it('desktop catalog keeps a single contained table and viewers have no edit action', async () => {
  viewport.mobile = false;
  useAuthStore.setState({ user: { currentBusiness: { role: 'Staff', permissions: ['catalog.view'] } } as never });
  view(<CatalogList />); const tableRegion = await screen.findByRole('region', { name: 'Catalog items table' });
  expect(within(tableRegion).getByRole('table')).toBeInTheDocument();
  expect(tableRegion).toHaveAttribute('tabindex', '0');
  expect(screen.queryByRole('region', { name: 'Catalog items' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
});

it('supplier record cards keep item mapping accessible while preserving read-only permission', async () => {
  useAuthStore.setState({ user: { currentBusiness: { role: 'Staff', permissions: ['supplier.view'] } } as never });
  view(<SupplierList />); const region = await screen.findByRole('region', { name: 'Suppliers' });
  expect(within(region).getByText('123456')).toBeInTheDocument();
  expect(within(region).queryByRole('button', { name: 'Edit Supplier one' })).not.toBeInTheDocument();
  fireEvent.click(within(region).getByRole('button', { name: 'Manage items for Supplier one' }));
  const dialog = await screen.findByRole('dialog', { name: 'Items supplied by Supplier one' });
  expect(within(dialog).queryByRole('button', { name: 'Link item' })).not.toBeInTheDocument();
  await within(dialog).findByText('No linked items yet.');
});

it('broker cards preserve the existing edit workflow', async () => {
  view(<BrokerList />); const region = await screen.findByRole('region', { name: 'Brokers' });
  expect(within(region).getByText('3')).toBeInTheDocument();
  fireEvent.click(within(region).getByRole('button', { name: 'Edit Broker one' }));
  expect(await screen.findByRole('dialog', { name: 'Edit Broker' })).toBeInTheDocument();
  expect(screen.getByLabelText('Broker Name')).toHaveValue('Broker one');
});

it('user cards expose the same scoped administration and credential actions', async () => {
  view(<UsersPage />); const region = await screen.findByRole('region', { name: 'Workspace users' });
  expect(within(region).getByText('staff@warehouse.example')).toBeInTheDocument();
  expect(within(region).getByText('Staff')).toBeInTheDocument();
  fireEvent.click(within(region).getByRole('button', { name: 'Edit Permissions' }));
  expect(await screen.findByRole('dialog', { name: 'Permissions for Staff person' })).toBeInTheDocument();
  expect(within(region).getByRole('button', { name: 'Share / Copy Credentials' })).toBeInTheDocument();
});
