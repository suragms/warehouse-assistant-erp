import { test, expect, type Page } from '@playwright/test';
const supplier = { id: 's1', name: 'Supplier A', isActive: true };
const catalog = { id: 'c1', itemCode: 'R1', name: 'Rice', isActive: true, defaultUnit: 'kg', currentStock: 10, reorderLevel: 2, categoryId: 'cat1', categoryName: 'Food', rowVersion: 'v1' };
const paged = (data: unknown[]) => ({ data, meta: { page: 1, pageSize: 50, totalCount: data.length, totalPages: 1 } });
async function mocks(page: Page) {
  const calls: string[] = [];
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    calls.push(`${route.request().method()} ${path}`);
    let data: unknown = paged([]);
    if (path === '/auth/refresh') data = { data: { accessToken: 'mock-session', user: { id: 'u1', name: 'Reviewer', email: 'review@example.test', businesses: [], currentBusiness: { businessId: 'b1', businessName: 'Test Warehouse', role: 'Owner', permissions: [] } } } };
    else if (path === '/catalog/suppliers') data = [supplier];
    else if (path === '/catalog/brokers' || path === '/users' || path === '/reports/spend') data = [];
    else if (path === '/purchases/p1/activity' || path === '/purchases/p1/damage-reports') data = [];
    else if (path === '/catalog/items') data = paged([catalog]);
    else if (path === '/catalog/items/duplicates' || path === '/catalog/categories' || path.includes('/types')) data = [];
    else if (path === '/catalog/items/c1') data = { ...catalog, categoryId: 'cat1', categoryName: 'Food', currentStock: 10, reorderLevel: 2, kgPerUnit: 1, rowVersion: 'v1' };
    else if (path === '/stock' || path === '/stock/low-stock' || path === '/stock/out-of-stock') data = paged([]);
    else if (path === '/stock/c1') data = { ...catalog, categoryName: 'Food', systemStock: 10, physicalStock: 9, reservedStock: 2, availableStock: 8, reorderLevel: 2, rowVersion: 'v1' };
    else if (path === '/purchases/p1') data = { id: 'p1', orderNumber: 'PO-TEST', supplierId: 's1', supplierName: 'Supplier A', status: 2, paymentState: 0, deliveryState: 0, version: 1,
      subtotal: 40, taxTotal: 0, grandTotal: 40, createdAt: '2026-10-01T00:00:00Z', items: [{ id: 'pi1', catalogItemId: 'c1', itemCode: 'R1', catalogItemName: 'Rice', orderedQuantity: 10, receivedQuantity: 0, unitPrice: 4, lineTotal: 40 }] };
    else if (path === '/notifications/unread-count') data = { count: 0 };
    else if (path === '/dashboard') data = { purchaseMetrics: { todayPurchasesCount: 0, pendingPurchasesCount: 0, activePurchasesCount: 0, completedPurchasesCount: 0, totalPurchaseSpend: 0 }, stockMetrics: { totalCatalogItems: 0, lowStockCount: 0, outOfStockCount: 0, itermsWithPhysicalVariance: 0 }, operationalAlerts: [], recentPurchases: [], recentStockActivity: [] };
    else if (path === '/reports/purchases-summary') data = { bySupplier: [], byCategory: [], byStatus: [] };
    else if (path === '/reports/stock-analytics') data = { totalCatalogItems: 0, lowStockCount: 0, outOfStockCount: 0, estimatedInventoryValue: 0, totalMovementsCount: 0 };
    else if (path === '/reports/comparison') data = { currentPeriodSpend: 0, previousPeriodSpend: 0, spendChangePercentage: 0, currentPeriodOrders: 0, previousPeriodOrders: 0, ordersChangePercentage: 0, currentPeriodAvgOrderValue: 0, previousPeriodAvgOrderValue: 0, avgOrderValueChangePercentage: 0 };
    else if (path === '/ai/purchase-intent/parse') data = { status: 'AmbiguousMatch', supplierId: 's1', supplierName: 'Supplier A',
      items: [{ catalogItemName: 'Rice with a very long descriptive product name for wrapping checks', requestedQuantity: 2.5, isAmbiguous: true,
        options: [{ catalogItemId: 'c1', name: 'Rice', description: 'R1' }] }] };
    else if (path === '/purchases/preview') data = { subtotal: 13, taxTotal: 0, grandTotal: 13, items: [{ lineTotal: 13 }], previewToken: 'mock-preview' };
    else if (path === '/purchases' && route.request().method() === 'POST') return route.fulfill({ status: 409, json: { error: 'PURCHASE_EXISTS' } });
    await route.fulfill({ json: data });
  });
  return calls;
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => { const main = document.querySelector('main')!; return document.documentElement.scrollWidth <= window.innerWidth && main.scrollWidth <= main.clientWidth; })).toBe(true);
for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  test(`purchase review, errors and keyboard space at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const calls = await mocks(page);
    await page.goto('/purchases/new');
    await expect(page.getByRole('heading', { name: 'AI Purchase Helper' })).toBeVisible();
    await page.getByLabel('Enter purchase request').fill('Buy 2.5 kg rice from Supplier A');
    await page.getByRole('button', { name: 'Analyze Intent' }).click();
    await expect(page.getByText('Review AI suggestions')).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`review-${width}.png`), fullPage: true });
    expect(calls.filter(c => c.startsWith('POST /purchases'))).toHaveLength(0);
    await page.getByLabel('Resolve item 1').selectOption('c1');
    await page.getByLabel('Suggested quantity 1').fill('3.25');
    await page.getByRole('button', { name: 'Apply to purchase form' }).click();
    await expect(page.getByLabel('Catalog item 1')).toHaveValue('c1');
    expect(calls.filter(c => c.startsWith('POST /purchases'))).toHaveLength(0);
    // A reduced visual area checks scroll access while editing; physical keyboards require device QA.
    await page.setViewportSize({ width, height: 400 });
    await page.getByLabel('Unit price 1').fill('4');
    await page.getByLabel('Discount percent 1').fill('10');
    await page.getByLabel('Tax percent 1').fill('5');
    await page.getByRole('button', { name: 'Preview Purchase', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Review the server preview');
    expect(calls.filter(c => c === 'POST /purchases')).toHaveLength(0);
    const submit = page.getByRole('button', { name: 'Create Purchase Order', exact: true });
    await submit.scrollIntoViewIfNeeded(); await expect(submit).toBeInViewport(); await submit.click();
    await expect(page.getByRole('alert')).toContainText('may already exist'); await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`error-${width}.png`), fullPage: true });
    expect(calls.filter(c => c === 'POST /purchases')).toHaveLength(1);
    expect(calls.filter(c => c.includes('/stock') && c.startsWith('POST'))).toHaveLength(0);
    expect(errors).toEqual([]);
  });
}
for (const [route, heading] of [['/dashboard', 'Dashboard'], ['/reports', 'Reports & Analytics'], ['/purchases/list', 'Purchase Orders'],
  ['/inventory/all', 'Inventory'], ['/suppliers', 'Suppliers'], ['/brokers', 'Brokers'], ['/users', 'User Management'], ['/notifications', 'Notifications & Alerts']]) {
  test(`existing screen ${route}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await mocks(page); await page.goto(route);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
for (const width of widths) {
  test(`login, business switch, failures and server logout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 }); const calls = await mocks(page);
    let loggedIn = false, selected = 'b1', switchFails = true, logoutFails = true;
    const session = () => ({ data: { accessToken: `session-${selected}`, user: { id: 'u1', name: 'Reviewer', email: 'review@example.test',
      businesses: [{ businessId: 'b1', businessName: 'Warehouse A', role: 'Owner' }, { businessId: 'b2', businessName: 'Warehouse B', role: 'Owner' }],
      currentBusiness: { businessId: selected, businessName: selected === 'b1' ? 'Warehouse A' : 'Warehouse B', role: 'Owner', permissions: [] } } } });
    await page.route('**/api/v1/auth/refresh', route => route.fulfill(loggedIn ? { json: session() } : { status: 401, json: { error: 'SESSION_EXPIRED' } }));
    await page.route('**/api/v1/auth/login', async route => {
      expect(route.request().postDataJSON()).toEqual({ email: 'review@example.test', password: 'test-password' });
      loggedIn = true; await route.fulfill({ json: session() });
    });
    await page.route('**/api/v1/auth/select-business', async route => {
      calls.push('SWITCH_BUSINESS');
      if (switchFails) { switchFails = false; await route.fulfill({ status: 403, json: { error: { message: 'You do not belong to this business.' } } }); return; }
      selected = route.request().postDataJSON().businessId; await route.fulfill({ json: session() });
    });
    await page.route('**/api/v1/auth/logout', async route => {
      calls.push('SERVER_LOGOUT');
      if (logoutFails) { logoutFails = false; await route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } }); return; }
      loggedIn = false; await route.fulfill({ json: { data: true } });
    });
    await page.goto('/dashboard'); await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email address').fill('review@example.test'); await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    const openNav = async () => { if (width < 768) await page.getByRole('button', { name: 'More', exact: true }).click(); };
    await openNav(); const business = page.getByRole('combobox', { name: 'Business', exact: true });
    await business.selectOption('b2'); await expect(page.getByRole('alert').filter({ visible: true })).toBeVisible();
    await expect(business).toHaveValue('b1'); await business.selectOption('b2'); await openNav();
    await expect(business).toHaveValue('b2'); await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`business-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Sign out' }).click(); await expect(page.getByRole('alert').filter({ visible: true })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/); await page.getByRole('button', { name: 'Sign out' }).click(); await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard'); await expect(page).toHaveURL(/\/login$/);
    expect(calls.filter(c => c === 'SERVER_LOGOUT')).toHaveLength(2); expect(calls.filter(c => c === 'SWITCH_BUSINESS')).toHaveLength(2);
    expect(loggedIn).toBe(false);
  });
}
for (const width of widths) {
  test(`explicit partial and full payment at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    const calls = await mocks(page); let paidAmount = 0, version = 1;
    const order = () => ({ id: 'p1', orderNumber: 'PO-TEST', supplierId: 's1', supplierName: 'Supplier A', status: 1,
      paymentState: paidAmount === 40 ? 2 : paidAmount > 0 ? 1 : 0, deliveryState: 0, version,
      subtotal: 40, taxTotal: 0, grandTotal: 40, paidAmount, remainingAmount: 40 - paidAmount,
      dueDate: '2026-10-08', createdAt: '2026-10-01T00:00:00Z', items: [] });
    await page.route('**/api/v1/purchases/p1', route => route.fulfill({ json: order() }));
    await page.route('**/api/v1/purchases/p1/payment', async route => {
      expect(route.request().method()).toBe('PATCH'); const body = route.request().postDataJSON();
      expect(body.expectedVersion).toBe(version); paidAmount = body.paidAmount; version++; calls.push('PAYMENT');
      await route.fulfill({ json: order() });
    });
    await page.goto('/purchases/p1'); await page.getByRole('button', { name: 'Record Payment' }).click();
    expect(calls).not.toContain('PAYMENT'); await page.getByLabel('Total paid to date').fill('12.5'); await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`payment-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Save Payment Total' }).click();
    await expect(page.getByText('Payment total recorded.')).toBeVisible(); await expect(page.getByText('₹27.50')).toBeVisible();
    await page.getByRole('button', { name: 'Record Payment' }).click(); await page.getByLabel('Total paid to date').fill('40');
    await page.getByRole('button', { name: 'Save Payment Total' }).click();
    await expect(page.getByText('Paid', { exact: true })).toBeVisible(); await expect(page.getByText('₹0.00', { exact: true }).last()).toBeVisible();
    expect(calls.filter(c => c === 'PAYMENT')).toHaveLength(2);
    expect(calls.filter(c => c.startsWith('POST') && (/status|receive|stock/.test(c)))).toHaveLength(0);
    expect(calls.filter(c => c === 'POST /auth/refresh')).toHaveLength(1); await noOverflow(page);
  });
}
for (const width of widths) {
  test(`variant create, edit, delete and archive at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    const calls = await mocks(page);
    let variants: { id: string; name: string; kgPerUnit: number; rowVersion: string; isActive: boolean }[] = [];
    await page.route('**/api/v1/catalog/items/c1', route => route.fulfill({ json: { ...catalog, variants } }));
    await page.route('**/api/v1/catalog/items/c1/variants', async route => {
      const input = route.request().postDataJSON(); calls.push('CREATE_VARIANT');
      variants = [{ ...input, id: 'v1', rowVersion: 'version1', isActive: true }];
      await route.fulfill({ status: 201, json: variants[0] });
    });
    await page.route('**/api/v1/catalog/items/c1/variants/v1*', async route => {
      if (route.request().method() === 'DELETE') {
        expect(new URL(route.request().url()).searchParams.get('expectedVersion')).toBe('version2');
        calls.push('DELETE_VARIANT'); variants = []; await route.fulfill({ status: 204 });
      } else {
        const input = route.request().postDataJSON(); expect(input.rowVersion).toBe('version1');
        calls.push('UPDATE_VARIANT'); variants = [{ ...input, rowVersion: 'version2' }]; await route.fulfill({ json: variants[0] });
      }
    });
    await page.route('**/api/v1/catalog/items/c1/archive', async route => {
      expect(route.request().method()).toBe('PATCH'); expect(route.request().postDataJSON().rowVersion).toBe('v1');
      calls.push('ARCHIVE_ITEM'); await route.fulfill({ status: 204 });
    });
    await page.goto('/catalog/items/c1');
    await page.getByRole('button', { name: 'Add Variant' }).click();
    await page.getByLabel('Variant name').fill('Small Bag'); await page.getByLabel('Variant kg per unit').fill('5');
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`variants-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Save Variant' }).click();
    await page.getByRole('button', { name: 'Edit variant Small Bag' }).click();
    await page.getByLabel('Variant name').fill('Large Bag'); await page.getByLabel('Variant kg per unit').fill('25');
    await page.getByRole('button', { name: 'Save Variant' }).click();
    await page.getByRole('button', { name: 'Delete variant Large Bag' }).click();
    expect(calls).not.toContain('DELETE_VARIANT'); await noOverflow(page);
    await page.getByRole('button', { name: 'Delete Variant', exact: true }).click();
    await expect(page.getByText('No variants yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Archive', exact: true }).click(); await noOverflow(page);
    await page.getByRole('button', { name: 'Archive Item', exact: true }).click();
    await expect(page).toHaveURL(/\/catalog\/items$/);
    expect(calls.filter(c => /^(CREATE_VARIANT|UPDATE_VARIANT|DELETE_VARIANT|ARCHIVE_ITEM)$/.test(c))).toEqual(['CREATE_VARIANT', 'UPDATE_VARIANT', 'DELETE_VARIANT', 'ARCHIVE_ITEM']);
    expect(calls).not.toContain('DELETE /catalog/items/c1');
    await noOverflow(page);
  });
}
for (const width of widths) {
  test(`explicit verification and partial receiving at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    const calls = await mocks(page);
    let status = 2, version = 1, received = 0;
    const order = () => ({ id: 'p1', orderNumber: 'PO-TEST', supplierId: 's1', supplierName: 'Supplier A', status, paymentState: 0,
      deliveryState: received === 10 ? 2 : received > 0 ? 1 : 0, version, subtotal: 40, taxTotal: 0, grandTotal: 40,
      verifiedAt: status >= 4 ? '2026-10-01T00:00:00Z' : undefined, createdAt: '2026-10-01T00:00:00Z',
      items: [{ id: 'pi1', catalogItemId: 'c1', itemCode: 'R1', catalogItemName: 'Rice', orderedQuantity: 10, receivedQuantity: received, unitPrice: 4, lineTotal: 40 }] });
    await page.route('**/api/v1/purchases/p1', route => route.fulfill({ json: order() }));
    await page.route('**/api/v1/purchases/p1/status', async route => {
      const body = route.request().postDataJSON(); expect(body.expectedVersion).toBe(version);
      calls.push(`LIFECYCLE ${body.status}`); status = body.status; version++;
      await route.fulfill({ json: order() });
    });
    await page.route('**/api/v1/purchases/p1/receive', async route => {
      const body = route.request().postDataJSON(); expect(body.expectedVersion).toBe(version);
      calls.push('RECEIVE'); received += body.items[0].receivedQuantityDelta; version++;
      if (received === 10) status = 5;
      await route.fulfill({ json: order() });
    });
    await page.goto('/purchases/p1');
    await expect(page.getByRole('button', { name: 'Mark Arrived' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commit Received Items to Stock' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark Arrived' }).click();
    await page.getByRole('button', { name: 'Verify Delivery' }).click();
    const receive = page.getByLabel('Receive quantity for Rice'); await receive.fill('2');
    await page.getByRole('button', { name: 'Commit Received Items to Stock' }).click();
    await expect(receive).toHaveAttribute('max', '8'); await receive.fill('8');
    await page.getByRole('button', { name: 'Commit Received Items to Stock' }).click();
    await expect(page.getByRole('button', { name: 'Commit Received Items to Stock' })).toHaveCount(0);
    expect(status).toBe(5); expect(received).toBe(10);
    expect(calls.filter(c => c.startsWith('LIFECYCLE'))).toEqual(['LIFECYCLE 3', 'LIFECYCLE 4']);
    expect(calls.filter(c => c === 'RECEIVE')).toHaveLength(2);
    await noOverflow(page);
  });
}
const regressionRoutes = ['/dashboard', '/reports', '/purchases/list', '/purchases/overview', '/purchases/p1',
  '/inventory/overview', '/inventory/all', '/inventory/low-stock', '/inventory/out-of-stock', '/inventory/c1', '/inventory/c1/activity',
  '/catalog/items', '/catalog/items/new', '/catalog/items/c1', '/catalog/categories', '/catalog/types', '/catalog/barcodes', '/catalog/duplicates',
  '/suppliers', '/brokers', '/users', '/notifications'];
for (const width of widths) {
  test(`screen regression and overflow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await mocks(page);
    for (const route of regressionRoutes) {
      await test.step(route, async () => {
        await page.goto(route);
        await expect(page.getByRole('main'), `Route ${route}; browser errors: ${errors.join('; ')}`).toBeVisible();
        await expect(page.getByRole('main').locator('h1').first()).toBeVisible();
        await noOverflow(page);
      });
    }
    await page.screenshot({ path: testInfo.outputPath(`screen-regression-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
