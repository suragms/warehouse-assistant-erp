import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { hasPermission } from './hasPermission';

export const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export const PermissionGate: React.FC<{ permission: string; children: React.ReactNode }> = ({ permission, children }) => {
  const user = useAuthStore((s) => s.user);

  if (!user?.currentBusiness) return null;
  if (user.currentBusiness.role === 'Owner' || user.currentBusiness.role === 'Admin' || user.currentBusiness.role === 'SuperAdmin') return <>{children}</>;

  const hasPerm = user.currentBusiness.permissions?.includes(permission);
  return hasPerm ? <>{children}</> : null;
};

export const PermissionRoute = ({ permission, children }: { permission?: string; children: React.ReactNode }) => {
  const user = useAuthStore(s => s.user);
  return hasPermission(user, permission) ? <>{children}</> : <div role="alert" className="p-6"><h1 className="text-xl font-bold">Access unavailable</h1><p>Select an active business or contact its owner for access to this page.</p></div>;
};
