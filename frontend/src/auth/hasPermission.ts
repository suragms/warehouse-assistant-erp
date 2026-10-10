import type { User } from '../types/auth';

export function hasPermission(user: User | null, permission?: string) {
  if (!user?.currentBusiness) return false;
  return !permission || ['Owner', 'Admin', 'SuperAdmin'].includes(user.currentBusiness.role) || user.currentBusiness.permissions.includes(permission);
}
