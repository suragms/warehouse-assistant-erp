import { test, expect, type Page } from '@playwright/test';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { readFileSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
// Kept outside the fixture suite: every request reaches the actual local API.
// Credentials belong to disposable test accounts, never production users.
const session = JSON.parse(readFileSync('live-session.local', 'utf8').replace(/^\uFEFF/, '')) as { businessId: string; password: string; itemId: string; foreignBusinessId: string; foreignItemId: string };
async function signIn(page: Page, role: 'Owner' | 'Manager' | 'Staff') {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role.toLowerCase()}-${session.businessId}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(session.password);
  const response = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const login = await response; expect(login.status()).toBe(200);
  const body = await login.json(); expect(body.data.user.currentBusiness.role).toBe(role);
  await expect(page).not.toHaveURL(/login/);
  return body.data.accessToken as string;
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
let csvSupplierId = '';
test('live Owner persists usage, assignment, profile and encrypted credentials', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'Owner'); await page.goto('/operations');
  await page.getByLabel('Opening stock check notes').fill('Live verification'); await page.getByLabel('Opening stock check', { exact: true }).click(); await expect(page.getByRole('status')).toContainText('Checklist task completed.');
  await page.getByLabel('Live verification item quantity used').fill('2'); await page.getByRole('button', { name: 'Save daily usage' }).click(); await expect(page.getByRole('status')).toContainText('Daily usage saved.');
  await page.getByRole('button', { name: "Save today's snapshot" }).click(); await expect(page.getByRole('status')).toContainText("Today's snapshot saved.");
  await page.getByRole('button', { name: 'Assign task', exact: true }).click(); await page.getByLabel('Assigned member').selectOption({ label: 'Verification Staff' }); await page.getByLabel('Task type').fill('Live stock review'); await page.getByRole('button', { name: 'Save assignment' }).click(); await expect(page.getByText('Live stock review · assigned')).toBeVisible();
  await noOverflow(page); await page.locator('main').evaluate(el => el.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath('owner-operations.png') });
  await page.goto('/settings'); await page.getByLabel('Your name').fill('Verified Owner'); await page.getByRole('button', { name: 'Save personal profile' }).click(); await expect(page.getByRole('status')).toContainText('Personal profile saved.');
  await page.getByLabel('Phone', { exact: true }).fill('0000000000'); await page.getByRole('button', { name: 'Save profile', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Business profile saved.');
  await page.getByLabel('Credential type').selectOption('whatsapp_api_key'); await page.getByLabel('New credential value').fill('local-verification-no-delivery-1234'); await page.getByRole('button', { name: 'Save credential' }).click(); await expect(page.getByRole('status')).toContainText('Provider credential saved.'); await expect(page.getByLabel('New credential value')).toHaveValue('');
  await page.getByLabel('Delivery updates').uncheck(); await page.getByRole('button', { name: 'Save notifications' }).click(); await expect(page.getByRole('status')).toContainText('Notification preferences saved.');
  await page.reload(); await expect(page.getByLabel('Your name')).toHaveValue('Verified Owner'); await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('0000000000'); await expect(page.getByLabel('Delivery updates')).not.toBeChecked(); await expect(page.getByText('WhatsApp Cloud API token: Configured', { exact: false })).toBeVisible();
  await noOverflow(page); await page.getByRole('heading', { name: 'Owner command center' }).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('owner-settings.png') }); expect(errors).toEqual([]);
});
test('live Manager can correct usage and is denied owner-only mutations', async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 768 }); const token = await signIn(page, 'Manager'); await page.goto('/operations');
  await expect(page.getByText('Live stock review · assigned')).toBeVisible(); await expect(page.getByRole('button', { name: 'Assign task', exact: true })).toHaveCount(0);
  await page.getByLabel('Live verification item quantity used').fill('3'); await page.getByRole('button', { name: 'Save daily usage' }).click(); await expect(page.getByRole('status')).toContainText('Daily usage saved.');
  const headers = { Authorization: 'Bearer ' + token };
  expect((await page.request.post('http://localhost:5000/api/v1/operations/tasks', { headers, data: {} })).status()).toBe(403);
  expect((await page.request.get('http://localhost:5000/api/v1/settings/credentials', { headers })).status()).toBe(403);
  await page.goto('/settings'); await expect(page.getByLabel('Business name', { exact: true })).toBeDisabled(); await expect(page.getByRole('heading', { name: 'API credentials' })).toHaveCount(0);
  await page.getByLabel('Your name').fill('Verified Manager'); await page.getByRole('button', { name: 'Save personal profile' }).click(); await expect(page.getByRole('status')).toContainText('Personal profile saved.');
  await noOverflow(page); await page.locator('main').evaluate(el => el.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath('manager-settings.png') });
});
test('live Staff completes own assignment and cannot manage users or owner settings', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); const token = await signIn(page, 'Staff'); await page.goto('/operations');
  await expect(page.getByLabel('Live verification item quantity used')).toBeDisabled(); await page.getByRole('button', { name: 'Accept task', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Task accepted.');
  await page.getByRole('button', { name: 'Complete task', exact: true }).click(); await page.getByLabel('Correction note (optional)').fill('Live warehouse check complete'); await page.getByRole('button', { name: 'Confirm completion' }).click(); await expect(page.getByRole('status')).toContainText('Task completed.'); await page.reload(); await expect(page.getByText('Live stock review · completed')).toBeVisible();
  const headers = { Authorization: 'Bearer ' + token };
  expect((await page.request.get('http://localhost:5000/api/v1/users', { headers })).status()).toBe(403);
  expect((await page.request.put('http://localhost:5000/api/v1/settings/business', { headers, data: {} })).status()).toBe(403);
  await noOverflow(page); await page.locator('main').evaluate(el => el.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath('staff-operations.png') });
  await page.goto('/settings'); await expect(page.getByLabel('Business name', { exact: true })).toBeDisabled(); await expect(page.getByRole('heading', { name: 'API credentials' })).toHaveCount(0); await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  await page.getByLabel('Your name').fill('Verified Staff'); await page.getByRole('button', { name: 'Save personal profile' }).click(); await expect(page.getByRole('status')).toContainText('Personal profile saved.'); await noOverflow(page); await page.locator('main').evaluate(el => el.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath('staff-settings.png') });
});
for (const role of ['Owner', 'Manager', 'Staff'] as const) test('live ' + role + ' export, backup history, help and telemetry contracts', async ({ page }, info) => {
  test.setTimeout(90000);
  // Respect the unchanged production authentication limit between the two role suites.
  if (role === 'Owner') await new Promise(resolve => setTimeout(resolve, 40000));
  await page.setViewportSize(role === 'Staff' ? { width: 393, height: 852 } : role === 'Owner' ? { width: 1920, height: 1080 } : { width: 1366, height: 768 });
  const token = await signIn(page, role); const headers = { Authorization: 'Bearer ' + token }; const api = 'http://localhost:5000/api/v1';
  if (role === 'Owner') {
    const supplierResponse = await page.request.post(api + '/catalog/suppliers', { headers, data: { name: 'Live export supplier', isActive: true } }); expect(supplierResponse.status()).toBe(201); const supplier = await supplierResponse.json();
    const input = { supplierId: supplier.id, items: [{ catalogItemId: session.itemId, orderedQuantity: 2, unitPrice: 4.5 }] };
    const preview = await page.request.post(api + '/purchases/preview', { headers, data: input }); expect(preview.status()).toBe(200); const reviewed = await preview.json(); expect(reviewed.grandTotal).toBe(9);
    const saved = await page.request.post(api + '/purchases', { headers, data: { ...input, previewToken: reviewed.previewToken } }); expect(saved.status()).toBe(201); const order = await saved.json();
    const confirmed = await page.request.post(api + '/purchases/' + order.id + '/status', { headers, data: { status: 1, expectedVersion: order.version } }); expect(confirmed.status()).toBe(200);
    const report = await page.request.get(api + '/reports/spend', { headers }); expect(report.status()).toBe(200); expect((await report.json())[0].totalSpend).toBe(9);
  }
  await page.goto('/settings/backup');
  if (role === 'Staff') {
    await expect(page.getByRole('heading', { name: 'Access unavailable' })).toBeVisible();
    for (const path of ['backup.json', 'stock.xlsx', 'backup/logs']) expect((await page.request.get(api + '/exports/' + path, { headers })).status()).toBe(403);
    expect((await page.request.post(api + '/exports/backup/run', { headers })).status()).toBe(403);
  } else {
    await expect(page.getByRole('heading', { name: 'Export & Backup', exact: true })).toBeVisible();
    for (const [name, file] of [['Stock Excel', 'stock.xlsx'], ['Monthly purchases PDF', 'purchases.pdf'], ['Business JSON · last 90 days', 'backup.json'], ['Purchase ZIP', 'backup.zip']]) {
      const event = page.waitForEvent('download'); await page.getByRole('button', { name, exact: true }).click(); const download = await event; await download.saveAs(info.outputPath(file));
      const bytes = readFileSync(info.outputPath(file)); expect(bytes.length).toBeGreaterThan(100);
      if (file.endsWith('.pdf')) expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
      else if (file.endsWith('.xlsx') || file.endsWith('.zip')) expect(bytes.subarray(0, 2).toString()).toBe('PK');
      else { const data = JSON.parse(bytes.toString()); expect(data.businessId).toBe(session.businessId); expect(data.purchases).toHaveLength(1); expect(data.purchases[0].grandTotal).toBe(role === 'Owner' ? 9 : undefined); expect(bytes.toString()).not.toContain('Foreign verification'); expect(bytes.toString()).not.toContain('PasswordHash'); expect(bytes.toString()).not.toContain('local-verification-no-delivery'); }
    }
    await page.getByRole('button', { name: 'Save business export' }).click(); await expect(page.getByRole('status')).toContainText('Server business export completed.'); await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
    const history = await page.request.get(api + '/exports/backup/logs', { headers }); expect(history.status()).toBe(200); const logs = (await history.json()).items; expect(logs.length).toBeGreaterThan(0); expect(logs[0].filePath).not.toMatch(/[\\/]/);
    if (role === 'Owner') { await page.getByLabel('Backup JSON', { exact: true }).fill(readFileSync(info.outputPath('backup.json'), 'utf8')); await page.getByRole('button', { name: 'Validate backup' }).click(); await expect(page.getByText('Backup structure is valid. No writes performed.')).toBeVisible();
      const stored = readFileSync('../TestResults/LiveBackups/' + session.businessId + '/' + logs[0].filePath, 'utf8'); expect(stored).not.toContain('local-verification-no-delivery');
      await page.getByLabel('Backup JSON', { exact: true }).fill(stored); await page.getByRole('button', { name: 'Validate backup' }).click(); await expect(page.getByText('Backup structure is valid. No writes performed.')).toBeVisible();
      await page.getByLabel('Backup JSON', { exact: true }).fill(JSON.stringify({ schemaVersion: 1, businessId: session.foreignBusinessId, stock: [], suppliers: [], purchases: [], stockMovements: [] })); await page.getByRole('button', { name: 'Validate backup' }).click(); await expect(page.getByText('Backup belongs to another business or has no business ID.')).toBeVisible();
      const before = await (await page.request.get(api + '/operations/owner-dashboard', { headers })).json();
      const ai = await page.request.post(api + '/ai/purchase-intent/parse', { headers, data: { prompt: 'Buy 2 Live verification item' } }); expect(ai.status()).toBe(200);
      const after = await (await page.request.get(api + '/operations/owner-dashboard', { headers })).json(); expect(after.aiRequestsToday).toBe(before.aiRequestsToday + 1); expect(after.backupLastStatus).toBe('success');
      await page.goto('/settings'); await expect(page.getByText('AI requests today (UTC): ' + after.aiRequestsToday)).toBeVisible(); await expect(page.getByText('WhatsApp delivery history is unavailable until a delivery integration is connected.')).toBeVisible();
    } else expect((await page.request.post(api + '/exports/restore/dry-run', { headers, data: {} })).status()).toBe(403);
    await noOverflow(page); await page.screenshot({ path: info.outputPath(role.toLowerCase() + '-backup-runtime.png') });
  }
  await page.goto('/settings/help'); await expect(page.getByRole('heading', { name: 'How to use this app', exact: true })).toBeVisible(); await noOverflow(page); await page.screenshot({ path: info.outputPath(role.toLowerCase() + '-help-runtime.png') });
});

test('live realtime updates the correct item once, isolates tenants and permissions, and reconnects', async ({ page, browser, request }, info) => {
  test.setTimeout(60000); const api = 'http://localhost:5000/api/v1'; const owner = await signIn(page, 'Owner'); const headers = { Authorization: 'Bearer ' + owner };
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  await context.addInitScript(() => { const Native = window.WebSocket; const sockets: WebSocket[] = []; (window as unknown as { runtimeSockets: WebSocket[] }).runtimeSockets = sockets; window.WebSocket = class extends Native { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); sockets.push(this); } }; });
  const colleague = await context.newPage(); const online = () => colleague.evaluate(() => (window as unknown as { runtimeSockets: WebSocket[] }).runtimeSockets.filter(s => s.url.includes("/realtime") && s.readyState === WebSocket.OPEN).length); const browserEvents: { id: string; type: string; businessId: string; payload: { itemId: string } }[] = [];
  colleague.on('websocket', socket => { if (!socket.url().includes('/realtime')) return; socket.on('framereceived', frame => { for (const part of frame.payload.toString().split('\u001e').filter(Boolean)) { try { const value = JSON.parse(part); if (value.target === 'businessEvent') browserEvents.push(value.arguments[0]); } catch { /* Protocol keepalive is not an event. */ } } });  });
  const manager = await signIn(colleague, 'Manager'); await colleague.goto('/inventory/' + session.itemId); await expect.poll(online).toBeGreaterThan(0);
  const tokenFor = async (email: string) => { const result = await request.post(api + '/auth/login', { data: { email, password: session.password } }); expect(result.status()).toBe(200); return (await result.json()).data.accessToken as string; };
  const foreign = await tokenFor('owner-' + session.foreignBusinessId + '@example.test'), limited = await tokenFor('limited-' + session.businessId + '@example.test');
  const managerEvents: unknown[] = [], foreignEvents: unknown[] = [], limitedEvents: unknown[] = [];
  const connect = async (token: string, received: unknown[]) => { const connection = new HubConnectionBuilder().withUrl(api + '/realtime', { accessTokenFactory: () => token }).withAutomaticReconnect([0, 100, 1000]).configureLogging(LogLevel.None).build(); connection.on('businessEvent', event => received.push(event)); await connection.start(); return connection; };
  const connections = await Promise.all([connect(manager, managerEvents), connect(foreign, foreignEvents), connect(limited, limitedEvents)]);
  try {
    expect((await request.post(api + '/realtime/negotiate?negotiateVersion=1')).status()).toBe(401);
    expect((await request.get(api + '/stock/' + session.itemId, { headers: { Authorization: 'Bearer ' + limited } })).status()).toBe(403);
    const foreignStock = await (await request.get(api + '/stock/' + session.foreignItemId, { headers: { Authorization: 'Bearer ' + foreign } })).json(); expect(foreignStock.systemStock).toBe(99);
    const adjust = async () => { const current = await (await page.request.get(api + '/stock/' + session.itemId, { headers })).json(); const response = await page.request.post(api + '/stock/' + session.itemId + '/adjust', { headers, data: { quantityDelta: 1, reason: 'Live realtime verification', expectedVersion: current.rowVersion } }); expect(response.status()).toBe(200); return response.json(); };
    const changed = await adjust(); await expect(colleague.getByText('System Stock', { exact: true }).locator('..').locator('p.text-2xl')).toHaveText(String(changed.systemStock));
    await expect.poll(() => managerEvents.length).toBe(1); await expect.poll(() => browserEvents.length).toBe(1);
    expect(browserEvents[0].type).toBe('stock.changed'); expect(browserEvents[0].businessId).toBe(session.businessId); expect(browserEvents[0].payload.itemId).toBe(session.itemId); expect(Object.keys(browserEvents[0])).not.toContain('quantity');
    await colleague.screenshot({ path: info.outputPath('realtime-colleague-stock.png') });
    expect((await request.post(api + '/stock/' + session.itemId + '/adjust', { headers: { Authorization: 'Bearer ' + limited }, data: { quantityDelta: 1, expectedVersion: changed.rowVersion } })).status()).toBe(403);
    await colleague.getByRole('button', { name: 'Open navigation' }).click(); await colleague.getByRole('link', { name: 'Daily Operations', exact: true }).click(); await expect.poll(online).toBeGreaterThan(0); await expect(colleague.getByText(new RegExp('Stock ' + changed.systemStock + ' PCS'))).toBeVisible();
    await context.setOffline(true); await colleague.evaluate(() => (window as unknown as { runtimeSockets: WebSocket[] }).runtimeSockets.filter(s => s.url.includes('/realtime')).forEach(s => s.close())); await expect.poll(online).toBe(0);
    const offlineChange = await adjust(); await expect.poll(() => managerEvents.length).toBe(2); await context.setOffline(false); await expect.poll(online, { timeout: 15000 }).toBeGreaterThan(0);
    await expect(colleague.getByText(new RegExp('Stock ' + offlineChange.systemStock + ' PCS')), 'daily operations must refresh after a missed stock event').toBeVisible({ timeout: 10000 });
    await colleague.screenshot({ path: info.outputPath('realtime-reconnected-operations.png') });
    await new Promise(resolve => setTimeout(resolve, 300)); expect(managerEvents).toHaveLength(2); expect(foreignEvents).toHaveLength(0); expect(limitedEvents).toHaveLength(0);
    expect((await (await request.get(api + '/stock/' + session.foreignItemId, { headers: { Authorization: 'Bearer ' + foreign } })).json()).systemStock).toBe(99);
  } finally { await Promise.all(connections.map(c => c.stop())); await context.close(); }
});
test('live selected purchase CSV copies authoritative amounts and balance', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']); const token = await signIn(page, 'Owner');
  const response = await page.request.get('http://localhost:5000/api/v1/exports/backup.json', { headers: { Authorization: 'Bearer ' + token } }); expect(response.status()).toBe(200); const data = await response.json(); expect(data.purchases).toHaveLength(1);
  await page.goto('/purchases/list'); await page.getByLabel('Select ' + data.purchases[0].orderNumber, { exact: true }).check(); await page.getByRole('button', { name: 'Copy selected CSV' }).click();
  await expect(page.getByRole('status')).toContainText('Selected purchases copied as CSV.'); const csv = await page.evaluate(() => navigator.clipboard.readText()); expect(csv).toContain('9.00,9.00'); expect(csv).not.toContain('Foreign verification');
});
for (const role of ['Owner', 'Manager', 'Staff'] as const) test('live ' + role + ' authoritative CSV files and role protection', async ({ page }) => {
  test.setTimeout(90000);
  if (role === 'Owner') await new Promise(resolve => setTimeout(resolve, 40000));
  await page.setViewportSize(role === 'Staff' ? { width: 412, height: 915 } : role === 'Manager' ? { width: 1366, height: 768 } : { width: 1440, height: 900 });
  const token = await signIn(page, role), headers = { Authorization: 'Bearer ' + token }, api = 'http://localhost:5000/api/v1';
  mkdirSync('../TestResults/RuntimeCsv', { recursive: true });
  if (role === 'Owner') {
    const original = await (await page.request.get(api + '/catalog/items/' + session.itemId, { headers })).json();
    const supplierResponse = await page.request.post(api + '/catalog/suppliers', { headers, data: { name: 'ABC, Store "മലയാളം"', isActive: true } }); expect(supplierResponse.status()).toBe(201); csvSupplierId = (await supplierResponse.json()).id;
    writeFileSync('../TestResults/RuntimeCsv/scope.json', JSON.stringify({ supplierId: csvSupplierId }));
    const itemResponse = await page.request.post(api + '/catalog/items', { headers, data: { name: 'Item "Premium", മലയാളം', itemCode: 'CSV-LIVE', categoryId: original.categoryId, defaultUnit: 'BAG', kgPerUnit: 50, reorderLevel: 5, isActive: true } }); expect(itemResponse.status()).toBe(201); const item = await itemResponse.json();
    const freshStock = await (await page.request.get(api + '/stock/' + item.id, { headers })).json();
    const adjusted = await page.request.post(api + '/stock/' + item.id + '/adjust', { headers, data: { quantityDelta: 1.2345, expectedVersion: freshStock.rowVersion, reason: 'Disposable CSV verification stock' } }); expect(adjusted.status()).toBe(200);
    const physical = await page.request.post(api + '/stock/' + item.id + '/physical', { headers, data: { physicalStock: 1.1111, expectedVersion: (await adjusted.json()).rowVersion, reason: 'Disposable CSV count' } }); expect(physical.status()).toBe(200);
    const input = { supplierId: csvSupplierId, items: [{ catalogItemId: item.id, orderedQuantity: 2, unit: 'BAG', unitPrice: 4.5, kgPerUnit: 50, landingCostPerKg: 0.09 }] };
    const preview = await page.request.post(api + '/purchases/preview', { headers, data: input }); expect(preview.status()).toBe(200); const reviewed = await preview.json(); expect(reviewed.grandTotal).toBe(9);
    const saved = await page.request.post(api + '/purchases', { headers, data: { ...input, previewToken: reviewed.previewToken } }); expect(saved.status()).toBe(201); const order = await saved.json();
    const confirmed = await page.request.post(api + '/purchases/' + order.id + '/status', { headers, data: { status: 1, expectedVersion: order.version } }); expect(confirmed.status()).toBe(200);
    writeFileSync('../TestResults/RuntimeCsv/authoritative-values.json', JSON.stringify({ stock: await physical.json(), purchase: await confirmed.json(), supplierId: csvSupplierId }));
    expect((await page.request.get(api + '/exports/stock.csv?ids=' + session.foreignItemId, { headers })).status()).toBe(404);
  }
  csvSupplierId = JSON.parse(readFileSync('../TestResults/RuntimeCsv/scope.json', 'utf8')).supplierId;
  const paths = ['stock.csv', 'low-stock.csv', `suppliers/${csvSupplierId}/purchases.csv`, 'reports/suppliers.csv', 'reports/items.csv'];
  for (const [index, path] of paths.entries()) {
    const response = await page.request.get(api + '/exports/' + path, { headers });
    const allowed = role === 'Owner' || (role === 'Manager' && index < 2); expect(response.status()).toBe(allowed ? 200 : 403);
    if (allowed) { expect(response.headers()['content-type']).toContain('text/csv'); const text = await response.text(); expect(text).not.toContain('Foreign verification'); expect(text).toContain('മലയാളം'); writeFileSync(`../TestResults/RuntimeCsv/${role}-${index}.csv`, await response.body()); }
  }
  if (role !== 'Staff') {
    await page.goto('/inventory/all'); let pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Stock CSV', exact: true }).click(); await (await pending).saveAs(`../TestResults/RuntimeCsv/${role}-ui-stock.csv`);
    await page.getByRole('button', { name: 'Low Stock', exact: true }).click(); pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Low-stock CSV', exact: true }).click(); await (await pending).saveAs(`../TestResults/RuntimeCsv/${role}-ui-low.csv`);
    if (role === 'Owner') {
      await page.goto('/suppliers'); pending = page.waitForEvent('download'); await page.getByRole('row').filter({ hasText: 'ABC, Store' }).getByRole('button', { name: 'Purchase CSV', exact: true }).click(); await (await pending).saveAs('../TestResults/RuntimeCsv/Owner-ui-supplier.csv');
      await page.goto('/reports'); for (const [name, file] of [['Supplier report CSV', 'suppliers'], ['Item report CSV', 'items']]) { pending = page.waitForEvent('download'); await page.getByRole('button', { name, exact: true }).click(); await (await pending).saveAs(`../TestResults/RuntimeCsv/Owner-ui-report-${file}.csv`); }
    }
    await noOverflow(page);
  }
});
