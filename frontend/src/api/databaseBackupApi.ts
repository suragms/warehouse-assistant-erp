import apiClient from './apiClient';
import { useAuthStore } from '../stores/authStore';
import { backupDeviceKey } from './exportsApi';
export type DatabaseBackupSettings = { id: number; dailyEnabled: boolean; dailyHour: number; dailyMinute: number; monthlyEnabled: boolean; monthlyDay: number; monthlyHour: number; monthlyMinute: number; timeZone: string; dailyRetention: number; monthlyRetention: number; manualRetention: number; revision: string };
export type DatabaseBackupJob = { id: string; sourceId?: string; kind: string; status: string; stage: string; createdAt: string; completedAt?: string; sizeBytes?: number; errorCode?: string; sha256?: string; pinned: boolean; offsiteVerified: boolean; verifiedAt?: string; attempts: number };
export type DatabaseBackupOverview = { canRecover: boolean; overview: { settings: DatabaseBackupSettings; health: { ready: boolean; destination: string; durability: string; offsiteConfigured: boolean; warnings: string[] }; nextDaily?: string; nextMonthly?: string; lastSuccessful?: string; jobs: DatabaseBackupJob[]; liveRestoreEnabled: false } };
const route = '/exports/database-backups';
export const databaseBackupApi = {
  overview: async () => (await apiClient.get<DatabaseBackupOverview>(route)).data,
  settings: async (settings: DatabaseBackupSettings) => (await apiClient.put(route + '/settings', settings)).data,
  create: async () => (await apiClient.post(route)).data,
  verify: async (id: string) => (await apiClient.post(`${route}/${encodeURIComponent(id)}/verify`)).data,
  remove: async (id: string) => (await apiClient.delete(`${route}/${encodeURIComponent(id)}`)).data,
  pin: async (id: string, pinned: boolean) => (await apiClient.put(`${route}/${encodeURIComponent(id)}/pin`, { pinned })).data,
  recovery: async (id: string, confirmed: boolean) => (await apiClient.post<{ message: string }>(`${route}/${encodeURIComponent(id)}/recovery-preflight`, { confirmed })).data,
  download: async (id: string) => {
    const scope = backupDeviceKey();
    const operator = () => useAuthStore.getState().user?.currentBusiness?.role === 'SuperAdmin';
    if (!operator()) throw new Error('Platform operator access is required.');
    const response = await apiClient.get<Blob>(`${route}/${encodeURIComponent(id)}/download`, { responseType: 'blob' });
    if (!operator() || scope !== backupDeviceKey()) throw new Error('Your account or business changed. Retry the download.');
    const url = URL.createObjectURL(response.data); const link = document.createElement('a');
    link.href = url; link.download = `${id.replaceAll('-', '')}.wab`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
export function backupError(error: unknown) {
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 403) return 'Platform operator access is not enabled for this account. Contact the deployment administrator.';
  if (status === 409) return 'Another operation is active or the settings changed. Refresh and try again.';
  if (status === 400) return 'Check the schedule and confirmation. The latest validated archive or a protected archive cannot be deleted.';
  if (status === 503) return 'Backup storage, encryption keys or PostgreSQL tools are unavailable. Check server health.';
  return 'The backup operation could not be completed. Check your connection and retry.';
}
