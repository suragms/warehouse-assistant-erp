import { test, expect, type Page } from '@playwright/test';
async function fixture(page: Page, role: 'Owner' | 'Manager' | 'Staff', failure = false) {
  const calls: string[] = [];
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', ''); calls.push(url.pathname + url.search);
    let data: unknown = [];
    if (path === '/auth/refresh') data = { data: { accessToken: 'fixture-csv', user: { id: 'u', name: 'CSV reviewer', email: 'review@test.local', businesses: [], currentBusiness: { businessId: 'b', businessName: 'Harisree Agency', role, permissions: role === 'Staff' ? ['stock.view'] : ['reports.view', 'stock.view', 'supplier.view', 'purchase.view'] } } } };
    else if (path.endsWith('.csv')) return failure ? route.fulfill({ status: 400, json: { message: 'Too large' } }) : route.fulfill({ contentType: 'text/csv; charset=utf-8', body: 'header\n"മലയാളം, quoted"\n', headers: { 'Content-Disposition': 'attachment; filename="harisree_test.csv"', 'Access-Control-Expose-Headers': 'Content-Disposition' } });
    else if (path.startsWith('/stock')) data = { data: [{ id: 'item', itemCode: 'RICE', name: 'Rice', categoryName: 'Food', defaultUnit: 'KG', systemStock: 1, physicalStock: 1, reservedStock: 0, availableStock: 1, reorderLevel: 2, isActive: true, rowVersion: 'v1' }], meta: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 } };
    else if (path === '/catalog/suppliers') data = [{ id: '12345678-1234-1234-1234-123456789012', name: 'ABC, Store മലയാളം', isActive: true, linkedItemsCount: 1 }];
    else if (path === '/notifications/unread-count') data = { count: 0 };
    else if (path === '/reports/purchases-summary') data = { bySupplier: [], byCategory: [], byStatus: [] };
    else if (path === '/reports/stock-analytics') data = { totalCatalogItems: 1, lowStockCount: 1, outOfStockCount: 0, estimatedInventoryValue: 0, totalMovementsCount: 0 };
    else if (path === '/reports/comparison') data = { currentPeriodSpend: 0, previousPeriodSpend: 0, spendChangePercentage: 0, currentPeriodOrders: 0, previousPeriodOrders: 0, ordersChangePercentage: 0, currentPeriodAvgOrderValue: 0, previousPeriodAvgOrderValue: 0, avgOrderValueChangePercentage: 0 };
    await route.fulfill({ json: data });
  }); return calls;
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('main')!.scrollWidth <= document.querySelector('main')!.clientWidth)).toBe(true);
async function download(page: Page, label: string) { const pending = page.waitForEvent('download'); await page.getByRole('button', { name: label, exact: true }).click(); expect((await pending).suggestedFilename()).toBe('harisree_test.csv'); }
for (const role of ['Owner', 'Manager', 'Staff'] as const) for (const [width, height] of [[390,844],[393,852],[412,915],[1366,768],[1440,900],[1920,1080]]) {
  test(`${role} CSV access and downloads at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height }); const calls = await fixture(page, role); await page.goto('/inventory/all');
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
    if (role === 'Staff') await expect(page.getByRole('button', { name: 'Stock CSV', exact: true })).toHaveCount(0);
    else { await download(page, 'Stock CSV'); await page.getByRole('button', { name: 'Low Stock', exact: true }).click(); await download(page, 'Low-stock CSV'); }
    await noOverflow(page); await page.screenshot({ path: info.outputPath('stock-csv.png'), fullPage: true });
    if (role !== 'Staff') {
      await page.goto('/suppliers'); await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible();
      if (role === 'Owner') await download(page, 'Purchase CSV'); else await expect(page.getByRole('button', { name: 'Purchase CSV', exact: true })).toHaveCount(0);
      await noOverflow(page); await page.screenshot({ path: info.outputPath('supplier-csv.png'), fullPage: true });
      await page.goto('/reports'); await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible();
      if (role === 'Owner') { await download(page, 'Supplier report CSV'); await download(page, 'Item report CSV'); expect(calls.some(c => c.includes('/exports/reports/items.csv?') && c.includes('start=') && c.includes('end='))).toBe(true); }
      else { await expect(page.getByRole('button', { name: /report CSV/ })).toHaveCount(0); }
      await noOverflow(page); await page.screenshot({ path: info.outputPath('reports-csv.png'), fullPage: true });
    }
  });
}
test('CSV failure stays actionable and does not show a false download', async ({ page }) => {
  await fixture(page, 'Owner', true); await page.goto('/inventory/all'); await page.getByRole('button', { name: 'Stock CSV', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Too large'); await expect(page.getByRole('button', { name: 'Stock CSV', exact: true })).toBeEnabled();
});
