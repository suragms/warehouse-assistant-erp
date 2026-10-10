import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';
import { BrandLoading } from '../components/BrandIdentity';
import { ProtectedRoute, PermissionRoute } from '../auth/Guards';
import { ToastProvider } from '../components/ui/ToastProvider';
import { AppShell } from '../layouts/AppShell';
import Login from '../pages/auth/Login';
import PasswordRecovery from '../pages/auth/PasswordRecovery';

const Dashboard = React.lazy(() => import('../pages/Dashboard'));
const CatalogList = React.lazy(() => import('../pages/catalog/CatalogList'));
const CatalogForm = React.lazy(() => import('../pages/catalog/CatalogForm'));
const CatalogDetail = React.lazy(() => import('../pages/catalog/CatalogDetail'));
const CategoryList = React.lazy(() => import('../pages/catalog/CategoryList'));
const TypeList = React.lazy(() => import('../pages/catalog/TypeList'));
const BarcodeManager = React.lazy(() => import('../pages/catalog/BarcodeManager'));
const DuplicateReview = React.lazy(() => import('../pages/catalog/DuplicateReview'));
const SupplierList = React.lazy(() => import('../pages/suppliers/SupplierList'));
const BrokerList = React.lazy(() => import('../pages/brokers/BrokerList'));
const StockDashboard = React.lazy(() => import('../pages/stock/StockDashboard'));
const StockList = React.lazy(() => import('../pages/stock/StockList'));
const StockDetail = React.lazy(() => import('../pages/stock/StockDetail'));
const StockActivity = React.lazy(() => import('../pages/stock/StockActivity'));

const PurchaseDashboard = React.lazy(() => import('../pages/purchases/PurchaseDashboard'));
const PurchaseList = React.lazy(() => import('../pages/purchases/PurchaseList'));
const PurchaseForm = React.lazy(() => import('../pages/purchases/PurchaseForm'));
const PurchaseDetail = React.lazy(() => import('../pages/purchases/PurchaseDetail'));
const ReportsDashboard = React.lazy(() => import('../pages/reports/ReportsDashboard'));
const NotificationsPage = React.lazy(() => import('../pages/NotificationsPage'));
const OperationsPage = React.lazy(() => import('../pages/OperationsPage'));
const SettingsPage = React.lazy(() => import('../pages/SettingsPage'));
const BackupPage = React.lazy(() => import('../pages/BackupPage'));
const HelpGuidePage = React.lazy(() => import('../pages/HelpGuidePage'));
const UsersPage = React.lazy(() => import('../pages/users/UsersPage'));
const MlPage = React.lazy(() => import('../pages/MlPage'));
const AuditPage = React.lazy(() => import('../pages/AuditPage'));

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <RouteErrorBoundary><React.Suspense fallback={<BrandLoading fullScreen />}><Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<PasswordRecovery key="forgot" />} />
            <Route path="/reset-password" element={<PasswordRecovery key="reset" reset />} />

            <Route path="/" element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />

                {/* Catalog Scope */}
                <Route path="catalog/items" element={<PermissionRoute permission="catalog.view"><CatalogList /></PermissionRoute>} />
                <Route path="catalog/items/new" element={<PermissionRoute permission="catalog.create"><CatalogForm /></PermissionRoute>} />
                <Route path="catalog/items/:id" element={<PermissionRoute permission="catalog.view"><CatalogDetail /></PermissionRoute>} />
                <Route path="catalog/items/:id/edit" element={<PermissionRoute permission="catalog.edit"><CatalogForm edit /></PermissionRoute>} />
                <Route path="catalog/categories" element={<PermissionRoute permission="catalog.view"><CategoryList /></PermissionRoute>} />
                <Route path="catalog/types" element={<PermissionRoute permission="catalog.view"><TypeList /></PermissionRoute>} />
                <Route path="catalog/barcodes" element={<PermissionRoute permission="catalog.view"><BarcodeManager /></PermissionRoute>} />
                <Route path="catalog/duplicates" element={<PermissionRoute permission="catalog.edit"><DuplicateReview /></PermissionRoute>} />

                {/* Suppliers & Brokers */}
                <Route path="suppliers" element={<PermissionRoute permission="supplier.view"><SupplierList /></PermissionRoute>} />
                <Route path="brokers" element={<PermissionRoute permission="broker.view"><BrokerList /></PermissionRoute>} />

                {/* Inventory / Stock — Phase 4 */}
                <Route path="inventory" element={<Navigate to="/inventory/overview" replace />} />
                <Route path="inventory/overview" element={<PermissionRoute permission="stock.view"><StockDashboard /></PermissionRoute>} />
                <Route path="inventory/all" element={<PermissionRoute permission="stock.view"><StockList /></PermissionRoute>} />
                <Route path="inventory/low-stock" element={<PermissionRoute permission="stock.view"><StockList /></PermissionRoute>} />
                <Route path="inventory/out-of-stock" element={<PermissionRoute permission="stock.view"><StockList /></PermissionRoute>} />
                <Route path="inventory/:id" element={<PermissionRoute permission="stock.view"><StockDetail /></PermissionRoute>} />
                <Route path="inventory/:id/activity" element={<PermissionRoute permission="stock.view"><StockActivity /></PermissionRoute>} />

                {/* Purchase Order Management — Phase 5 */}
                <Route path="purchases" element={<Navigate to="/purchases/overview" replace />} />
                <Route path="purchases/overview" element={<PermissionRoute permission="purchase.view"><PurchaseDashboard /></PermissionRoute>} />
                <Route path="purchases/list" element={<PermissionRoute permission="purchase.view"><PurchaseList /></PermissionRoute>} />
                <Route path="purchases/new" element={<PermissionRoute permission="purchase.create"><PurchaseForm /></PermissionRoute>} />
                <Route path="purchases/:id" element={<PermissionRoute permission="purchase.view"><PurchaseDetail /></PermissionRoute>} />
                <Route path="purchases/:id/edit" element={<PermissionRoute permission="purchase.edit"><PurchaseForm edit /></PermissionRoute>} />

                {/* Reports & Analytics — Phase 7 */}
                <Route path="reports" element={<PermissionRoute permission="reports.view"><ReportsDashboard /></PermissionRoute>} />
                <Route path="ml" element={<PermissionRoute permission="stock.view"><MlPage /></PermissionRoute>} />
                <Route path="audit" element={<PermissionRoute><AuditPage /></PermissionRoute>} />

                {/* Notifications — Phase 6 */}
                <Route path="notifications" element={<NotificationsPage />} />

                <Route path="operations" element={<PermissionRoute><OperationsPage /></PermissionRoute>} />
                <Route path="settings" element={<PermissionRoute><SettingsPage /></PermissionRoute>} />
                <Route path="settings/backup" element={<PermissionRoute permission="reports.view"><BackupPage /></PermissionRoute>} />
                <Route path="settings/help" element={<PermissionRoute><HelpGuidePage /></PermissionRoute>} />
                <Route path="*" element={<div className="p-6"><h1 className="text-xl font-bold">Page not found</h1><a href="/dashboard">Return to dashboard</a></div>} />
                <Route path="users" element={<PermissionRoute permission="users.view"><UsersPage /></PermissionRoute>} />
              </Route>
            </Route>

          </Routes></React.Suspense></RouteErrorBoundary>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};
