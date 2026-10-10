import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from '../pages/users/UsersPage';
import { useAuthStore } from '../stores/authStore';
import { usersApi } from '../api/usersApi';

vi.mock('../api/usersApi', async () => {
  const original = await vi.importActual('../api/usersApi');
  return {
    ...original,
    usersApi: {
      getUsers: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      blockUser: vi.fn(),
      deleteUser: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usersApi.getUsers).mockResolvedValue([]);
  useAuthStore.setState({
    user: {
      id: 'owner',
      name: 'Owner',
      email: 'owner@test.local',
      businesses: [],
      currentBusiness: { businessId: 'a', businessName: 'Harisree Traders', role: 'Owner', permissions: [] },
    },
  });
});

function view() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <UsersPage />
    </QueryClientProvider>
  );
}

it('creates a real Staff membership with backend value 4', async () => {
  vi.mocked(usersApi.createUser).mockResolvedValue({ id: 'staff', name: 'Staff', email: 'staff@test.local', role: 4, status: 0, createdAt: '2026-10-01' });
  view();
  fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
  expect(screen.getByLabelText('Role')).toHaveValue('4');
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Staff' } });
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'staff@test.local' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'strong-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
  await waitFor(() => expect(usersApi.createUser).toHaveBeenCalledWith(expect.objectContaining({ role: 4 }), expect.anything()));
});

it('manager sees the user list without administration controls', async () => {
  useAuthStore.setState({
    user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'a', businessName: 'A', role: 'Manager', permissions: ['users.view'] } },
  });
  view();
  expect(screen.queryByRole('button', { name: 'Add User' })).not.toBeInTheDocument();
  await screen.findByText('No users found in this workspace.');
});

it('uses correct role and status labels for existing staff', async () => {
  vi.mocked(usersApi.getUsers).mockResolvedValue([{ id: 'staff', name: 'Staff person', email: 'staff@test.local', role: 4, status: 1, createdAt: '2026-10-01' }]);
  view();
  await screen.findByText('Staff person');
  expect(screen.getByText('Staff')).toBeInTheDocument();
  expect(screen.getByText('Inactive')).toBeInTheDocument();
});

it('displays validation failures without closing the create form', async () => {
  vi.mocked(usersApi.createUser).mockRejectedValue(new Error('Email already registered'));
  view();
  fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
  fireEvent.submit(screen.getByRole('button', { name: 'Create User' }).closest('form')!);
  await screen.findByRole('alert');
  expect(screen.getByText('Add New User')).toBeInTheDocument();
});

it('admin can create owners and staffs, seeing all assignable roles', async () => {
  useAuthStore.setState({
    user: {
      id: 'admin',
      name: 'Harisree Admin',
      email: 'admin@harisree.com',
      businesses: [],
      currentBusiness: { businessId: 'a', businessName: 'Harisree Traders', role: 'Admin', permissions: ['users.manage'] },
    },
  });
  view();
  fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
  const roleSelect = screen.getByLabelText('Role') as HTMLSelectElement;
  const options = Array.from(roleSelect.options).map(o => o.text);
  expect(options).toContain('Owner');
  expect(options).toContain('Staff');
  expect(options).toContain('Admin');
  expect(options).toContain('Manager');
});

it('owner can only see Staff in the role creation dropdown', async () => {
  useAuthStore.setState({
    user: {
      id: 'owner',
      name: 'Business Owner',
      email: 'owner@harisree.com',
      businesses: [],
      currentBusiness: { businessId: 'a', businessName: 'Harisree Traders', role: 'Owner', permissions: [] },
    },
  });
  view();
  fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
  const roleSelect = screen.getByLabelText('Role') as HTMLSelectElement;
  const options = Array.from(roleSelect.options).map(o => o.text);
  expect(options).toEqual(['Staff']);
});

it('shows credential modal with copy and share actions after user creation', async () => {
  vi.mocked(usersApi.createUser).mockResolvedValue({
    id: 'new-staff',
    name: 'Ravi Kumar',
    email: 'ravi@harisree.com',
    role: 4,
    status: 0,
    createdAt: '2026-10-10',
  });
  view();
  fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Ravi Kumar' } });
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'ravi@harisree.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ravi123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

  await screen.findByText('User Created Successfully!');
  expect(screen.getByText('ravi@harisree.com')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Copy Full Credentials/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Share WhatsApp/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Share to App/i })).toBeInTheDocument();
});

it('allows sharing credentials for existing users in the table', async () => {
  vi.mocked(usersApi.getUsers).mockResolvedValue([
    { id: 'u1', name: 'Existing Colleague', email: 'colleague@harisree.com', role: 4, status: 0, createdAt: '2026-10-10' },
  ]);
  view();
  await screen.findByText('Existing Colleague');
  const shareBtn = screen.getByTitle('Share / Copy Credentials');
  fireEvent.click(shareBtn);

  expect(screen.getByText('Share Login Credentials')).toBeInTheDocument();
  expect(screen.getAllByText('colleague@harisree.com').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole('button', { name: /Copy Full Credentials/i })).toBeInTheDocument();
});
