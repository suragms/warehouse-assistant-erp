import { beforeEach, expect, it, vi } from 'vitest';
import { databaseBackupApi } from '../api/databaseBackupApi';
import apiClient from '../api/apiClient';
import { useAuthStore } from '../stores/authStore';
vi.mock('../api/apiClient', () => ({ default: { get: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks(); useAuthStore.setState({ user: { id: 'u1', name: 'Operator', email: 'operator@test.local', businesses: [], currentBusiness: { businessId: 'b1', businessName: 'A', role: 'SuperAdmin', permissions: [] } } });
  URL.createObjectURL = vi.fn(() => 'blob:fixture'); URL.revokeObjectURL = vi.fn();
});
it('refuses a full database download for ordinary business roles', async () => {
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, currentBusiness: { businessId: 'b1', businessName: 'A', role: 'Owner', permissions: [] } } });
  await expect(databaseBackupApi.download('id')).rejects.toThrow('Platform operator access'); expect(apiClient.get).not.toHaveBeenCalled();
});
it('does not save an archive after the account or selected business changes', async () => {
  let resolve!: (value: { data: Blob }) => void; vi.mocked(apiClient.get).mockReturnValue(new Promise(r => { resolve = r; }));
  const download = databaseBackupApi.download('id'); useAuthStore.getState().switchBusiness({ businessId: 'b2', businessName: 'B', role: 'SuperAdmin', permissions: [] }); resolve({ data: new Blob(['encrypted']) });
  await expect(download).rejects.toThrow('account or business changed'); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('downloads only the server-authorized encrypted file and uses a fixed archive name', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['encrypted']), headers: { 'content-disposition': 'filename=../../secret' } }); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await databaseBackupApi.download('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'); expect(apiClient.get).toHaveBeenCalledWith('/exports/database-backups/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/download', { responseType: 'blob' }); expect(click).toHaveBeenCalledOnce(); expect(URL.createObjectURL).toHaveBeenCalledOnce(); click.mockRestore();
});
