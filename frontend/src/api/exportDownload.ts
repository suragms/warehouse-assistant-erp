import apiClient from './apiClient';
import { useAuthStore } from '../stores/authStore';
export function mayDownloadReports() {
 const business = useAuthStore.getState().user?.currentBusiness;
 return !!business && ['Owner', 'Admin', 'Manager', 'SuperAdmin'].includes(business.role) && (['Owner', 'Admin', 'SuperAdmin'].includes(business.role) || business.permissions.includes('reports.view'));
}
export function exportAccessScope() {
  const business = useAuthStore.getState().user?.currentBusiness;
  return JSON.stringify([[useAuthStore.getState().user?.id, business?.businessId], useAuthStore.getState().isAuthenticated, business?.role, [...(business?.permissions ?? [])].sort()]);
}
export async function downloadServerFile(path: string, filename: string, params?: Record<string, unknown>, postBody?: unknown) {
  if (!mayDownloadReports()) throw new Error('Export access is unavailable.');
  const scope = exportAccessScope();
  try {
    const response = postBody === undefined ? await apiClient.get<Blob>(path, { params, responseType: 'blob' }) : await apiClient.post<Blob>(path, postBody, { responseType: 'blob' });
    if (scope !== exportAccessScope() || !mayDownloadReports()) throw new Error('Export access changed. Refresh and try again.');
    if (!(response.data instanceof Blob) || response.data.size === 0) throw new Error('The server returned an empty download.');
    const match = /filename="?([^";]+)"?/i.exec(response.headers['content-disposition'] ?? '');
    const name = match && /^[a-zA-Z0-9_.-]{1,160}$/.test(match[1]) ? match[1] : filename;
    const url = URL.createObjectURL(response.data), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    const response = (error as { response?: { status?: number; data?: unknown } }).response;
    if (!response) throw new Error(error instanceof Error && /^(Export access|The server returned)/.test(error.message) ? error.message : 'Download failed. Check your connection and retry.');
    if (response.status === 401 || response.status === 403) throw new Error('You do not have permission to export this report.');
    let message: string | undefined;
    try { const data = response.data instanceof Blob ? JSON.parse(await response.data.text()) : response.data; message = (data as { message?: string; error?: { message?: string } })?.message ?? (data as { error?: { message?: string } })?.error?.message; } catch { /* Use the status-specific fallback. */ }
    if ([400, 404, 409, 413, 503].includes(response.status ?? 0) && message) throw new Error(message);
    throw new Error(response.status === 413 ? 'This export is too large. Choose a shorter range.' : response.status === 400 ? 'Check the report filters.' : 'Download failed. Check your connection and retry.');
  }
}
