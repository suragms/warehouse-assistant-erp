import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermissionEditor } from '../components/users/PermissionEditor';
import { usersApi } from '../api/usersApi';
vi.mock('../api/usersApi', async original => ({ ...await original<typeof import('../api/usersApi')>(), usersApi: { getPermissions: vi.fn(), patchPermissions: vi.fn() } }));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(usersApi.patchPermissions).mockResolvedValue(); });
function view() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PermissionEditor userId="u2" userName="Staff" onClose={vi.fn()} /></QueryClientProvider>); }
it('restores a previously revoked default permission with a keyboard-operated grant', async () => {
  vi.mocked(usersApi.getPermissions).mockResolvedValue({ permissions: [], defaultPermissions: ['stock.view'] }); view();
  const toggle = await screen.findByRole('switch', { name: 'View Stock' }); expect(toggle).toHaveAttribute('aria-checked', 'false'); toggle.focus(); await userEvent.keyboard(' ');
  expect(toggle).toHaveAttribute('aria-checked', 'true'); expect(usersApi.patchPermissions).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(usersApi.patchPermissions).toHaveBeenCalledWith('u2', { grant: ['stock.view'], revoke: [] }));
});
it('revokes an existing non-default grant through the supported API delta', async () => {
  vi.mocked(usersApi.getPermissions).mockResolvedValue({ permissions: ['catalog.create'], defaultPermissions: [] }); view();
  fireEvent.click(await screen.findByRole('switch', { name: 'Create Items' })); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(usersApi.patchPermissions).toHaveBeenCalledWith('u2', { grant: [], revoke: ['catalog.create'] }));
});
it('reversing an unsaved toggle restores the base state without a write', async () => {
  vi.mocked(usersApi.getPermissions).mockResolvedValue({ permissions: ['stock.view'], defaultPermissions: ['stock.view'] }); view();
  const toggle = await screen.findByRole('switch', { name: 'View Stock' }); fireEvent.click(toggle); fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-checked', 'true'); expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled(); expect(usersApi.patchPermissions).not.toHaveBeenCalled();
});
