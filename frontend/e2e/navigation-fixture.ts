import type { Page } from '@playwright/test';
export type NavigationRole = 'Owner' | 'Manager' | 'Staff' | 'SuperAdmin';
// Matches the native role defaults, rather than granting every role all routes.
export const rolePermissions = (role: NavigationRole) => role === 'Staff'
  ? ['catalog.view', 'supplier.view', 'broker.view', 'purchase.view', 'purchase.create', 'purchase.verify', 'purchase.damage_report', 'stock.view', 'stock.adjust', 'stock.physical']
  : role === 'Manager' ? ['catalog.view', 'catalog.create', 'catalog.edit', 'supplier.view', 'supplier.create', 'supplier.edit', 'broker.view', 'broker.create', 'broker.edit', 'purchase.view', 'purchase.create', 'purchase.edit', 'purchase.verify', 'purchase.commit', 'purchase.delivery', 'purchase.damage_report', 'purchase.damage_approve', 'stock.view', 'stock.adjust', 'stock.physical', 'stock.system', 'reports.view', 'users.view', 'users.manage'] : [];
export async function navigationFixture(page: Page, role: NavigationRole, permissions = rolePermissions(role)) {
  const calls: string[] = [];
  const paged = (data: unknown[]) => ({ data, totalCount: data.length, totalPages: 1, meta: { page: 1, pageSize: 50, totalCount: data.length, totalPages: 1 } });
  const item = { id: 'c1', itemCode: 'R1', name: 'Rice', catalogItemName: 'Rice', defaultUnit: 'kg', currentStock: 10, isActive: true, reorderLevel: 2, rowVersion: 'v1' };
  const supplier = { id: 's1', name: 'Supplier A', isActive: true };
  const order = { id: 'p1', orderNumber: 'PO-NAV', supplierId: 's1', supplierName: supplier.name, status: 2, paymentState: 0, deliveryState: 0, version: 1, createdAt: '2026-10-02T00:00:00Z', items: [{ id: 'pi1', catalogItemId: 'c1', itemCode: 'R1', catalogItemName: 'Rice', orderedQuantity: 10, receivedQuantity: 0, unitPrice: 4, lineTotal: 40 }], ...(role === 'Owner' ? { subtotal: 40, taxTotal: 0, grandTotal: 40, paidAmount: 0, remainingAmount: 40 } : {}) };
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', ''), method = request.method();
    calls.push(`${method} ${path}`);
    let data: unknown = [];
    if (path === '/auth/refresh') data = { data: { accessToken: 'navigation-fixture', user: { id: 'u1', name: 'Warehouse colleague', email: 'colleague@example.test', businesses: [], currentBusiness: { businessId: 'b1', businessName: 'Harisree Agency', role, permissions } } } };
    else if (path === '/realtime/negotiate') return route.fulfill({ status: 503, json: {} });
    else if (path === '/notifications/unread-count') data = { count: 12 };
    else if (path === '/notifications') data = paged([{ id: 'n1', title: 'Delivery ready', message: 'Check PO-NAV', referenceType: 'Purchase', referenceId: 'p1', isRead: false, createdAt: '2026-10-02T00:00:00Z' }]);
    else if (path === '/exports/reports') data = { reports: [{ id: 'stock', title: 'Current stock', category: 'Inventory', period: false, statusFilter: 'none', itemRequired: false, formats: ['pdf', 'csv', 'xlsx'] }, { id: 'purchases', title: 'Purchase orders', category: 'Purchases', period: true, statusFilter: 'purchase', itemRequired: false, formats: ['pdf', 'csv', 'xlsx'] }], timezone: 'UTC', maxRows: 5000, missingCapabilities: [] };
    else if (path === '/exports/reports/history') data = { items: [] };
    else if (path.startsWith('/exports/database-backups')) return route.fulfill({ status: 403, json: { message: 'Platform operator access required.' } });
    else if (path.startsWith('/notifications/') && method !== 'GET') data = {};
    else if (path === '/dashboard') data = { purchaseMetrics: { todayPurchasesCount: 0, pendingPurchasesCount: 0, activePurchasesCount: 0, completedPurchasesCount: 0, totalPurchaseSpend: 0 }, stockMetrics: { totalCatalogItems: 0, lowStockCount: 0, outOfStockCount: 0, itermsWithPhysicalVariance: 0 }, operationalAlerts: [], recentPurchases: [], recentStockActivity: [] };
    else if (path === '/catalog/items') data = paged([item]);
    else if (path === '/catalog/items/c1') data = item;
    else if (path === '/catalog/suppliers') data = [supplier];
    else if (path === '/stock/filter-options') data = { categories: [], suppliers: [supplier] };
    else if (path.startsWith('/stock')) data = paged([item]);
    else if (path === '/purchases') data = paged([order]);
    else if (path === '/purchases/p1') data = order;
    else if (path === '/reports/purchases-summary') data = { bySupplier: [], byCategory: [], byStatus: [] };
    else if (path === '/reports/stock-analytics') data = { totalCatalogItems: 1, lowStockCount: 0, outOfStockCount: 0, estimatedInventoryValue: 0, totalMovementsCount: 0 };
    else if (path === '/reports/comparison') data = { currentPeriodSpend: 0, previousPeriodSpend: 0, spendChangePercentage: 0, currentPeriodOrders: 0, previousPeriodOrders: 0, ordersChangePercentage: 0, currentPeriodAvgOrderValue: 0, previousPeriodAvgOrderValue: 0, avgOrderValueChangePercentage: 0 };
    else if (path === '/settings/ai') data = { enabled: true, providerOrder: ['OpenAI'], models: {}, timeoutSeconds: 8, retries: 0, version: 'v1' };
    else if (path === '/settings/profile') data = { id: 'u1', name: 'Warehouse colleague', email: 'colleague@example.test' };
    else if (path === '/settings/business') data = { name: 'Harisree Agency', brandingTitle: 'Warehouse Assistant', version: 'v1', hasUploadedLogo: false, logoUploadAvailable: false };
    else if (path === '/settings/notifications') data = { notificationsEnabled: true, notificationKinds: ['delivery'] };
    else if (path === '/operations/owner-dashboard') data = { lowStockCount: 0, outOfStockCount: 0, pendingDamageCount: 0, exceptions: [], staffPerformance: [] };
    else if (path === '/operations/checklist/today') data = { date: '2026-10-02', morning: [], midday: [], evening: [], completionPercentage: 0 };
    else if (path === '/operations/checklist/summary') data = { totalTasks: 0, completedTasks: 0 };
    else if (path === '/operations/usage/today') data = { lines: [] };
    else if (path === '/operations/usage/summary') data = { totalItems: 0, missingItems: 0, totalQuantityUsed: 0 };
    else if (path === '/operations/reports/summary') data = { method: 'RULE-BASED', items: [], supplierFrequency: [] };
    await route.fulfill({ json: data });
  });
  return calls;
}
