import { test, expect, type Page } from '@playwright/test';
type Role = 'Owner' | 'Manager' | 'Staff';
async function fixture(page: Page, role: Role, empty = false) {
  const calls: string[] = []; let failure = false; let writesFail = false;
  let profile = { name: 'Harisree Agency', brandingTitle: 'Warehouse Assistant', version: 'v1', hasUploadedLogo: false, logoUploadAvailable: false };
  let personal = { id: 'u1', name: 'Warehouse colleague', email: 'colleague@example.test' };
  let preferences = { notificationsEnabled: true, notificationKinds: ['low_stock', 'delivery', 'stock_variance', 'staff_alert', 'opening_stock', 'physical_reminder'] };
  let templates = [{ slot: 0, key: 'open_check', description: 'Opening stock check', priority: 1, isActive: true }];
  let completed = false; let checklistNotes = '';
  let task = { id: 't1', staffId: 'u1', staffName: 'Warehouse colleague', taskType: 'Stock check', status: 'assigned', version: 'v1', assignedAt: '2026-10-02T00:00:00Z', correctionNote: '' };
  let tasks = empty ? [] : [task];
  let line = { catalogItemId: 'c1', itemName: 'Rice', unit: 'kg', openingQty: 10, purchasedQty: 0, quantityUsed: 0, closingQty: 10, expectedVersion: 'v1', notes: '' };
  let savedCredential = false; let backupLogs = empty ? [] : [{ id: "log1", runType: "manual", status: "success", filePath: "backup_20261002T000000Z_test.json", sizeBytes: 2048, rowCounts: { catalog: 1, purchases: 2 }, durationMs: 30, createdAt: "2026-10-02T00:00:00Z" }];
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', ''), method = request.method();
    calls.push(method + ' ' + path);
    if ((failure && (path.startsWith('/operations') || path.startsWith('/settings') || path.startsWith('/exports'))) || (writesFail && method !== 'GET' && !path.startsWith('/auth'))) return route.fulfill({ status: 503, json: { error: { message: 'Service unavailable' } } });
    const body = method !== 'GET' && request.postData() ? request.postDataJSON() : undefined;
    let data: unknown = [];
    if (path === '/auth/refresh') data = { data: { accessToken: 'fixture-session', user: { ...personal, businesses: [], currentBusiness: { businessId: 'b1', businessName: 'Harisree Agency', role, permissions: role === 'Staff' ? ['stock.view'] : ['stock.view', 'stock.adjust', 'users.view', 'users.manage', 'reports.view'] } } } };
    else if (path === "/exports/backup/logs") data = { items: backupLogs };
    else if (path === "/exports/backup/run") { const log = { id: "log2", runType: "manual", status: "success", filePath: "backup_20261002T010000Z_test.json", sizeBytes: 3000, rowCounts: { catalog: 1, purchases: 2 }, durationMs: 25, createdAt: "2026-10-02T01:00:00Z" }; backupLogs = [log, ...backupLogs]; data = log; }
    else if (path === "/exports/restore/dry-run") data = { valid: true, errors: [], rowCounts: { stock: 1 }, writesPerformed: false, restoreEnabled: false };
    else if (["/exports/stock.xlsx", "/exports/purchases.pdf", "/exports/backup.json", "/exports/backup"].includes(path)) return route.fulfill({ body: "fixture-download", contentType: "application/octet-stream", headers: { "Content-Disposition": "attachment; filename=business-test.bin", "Access-Control-Expose-Headers": "Content-Disposition" } });
    else if (path === '/settings/business') { if (method === 'PUT') profile = { ...profile, ...body, version: 'v2' }; data = profile; }
    else if (path === '/settings/profile') { if (method === 'PUT') personal = { ...personal, name: body.name }; data = personal; }
    else if (path === '/settings/notifications') { if (method === 'PUT') preferences = body; data = preferences; }
    else if (path === '/settings/ai') data = { enabled: true, providerOrder: ['OpenAI'], models: {}, timeoutSeconds: 8, retries: 0, version: 'v1' };
    else if (path === '/settings/credentials') data = savedCredential ? [{ credentialType: 'openai_key', configured: true, lastFour: '1234', version: 'v2', updatedAt: '2026-10-02' }] : [];
    else if (path.startsWith('/settings/credentials/')) { expect(body.value).toBe('browser-only-test-key-1234'); savedCredential = true; data = { credentialType: 'openai_key', configured: true, lastFour: '1234', version: 'v2' }; }
    else if (path === '/operations/checklist/today') data = { date: '2026-10-02', morning: empty ? [] : [{ ...templates[0], isCompleted: completed, notes: checklistNotes }], midday: [], evening: [], completionPercentage: completed ? 100 : 0 };
    else if (path === '/operations/checklist/summary') data = { totalTasks: empty ? 0 : 1, completedTasks: completed ? 1 : 0, averageCompletionRate: completed ? 100 : 0 };
    else if (path.startsWith('/operations/checklist/0/')) { completed = true; checklistNotes = body.notes; data = {}; }
    else if (path === '/operations/checklist/templates') { if (method === 'PUT') templates = body; data = templates; }
    else if (path === '/operations/usage/today') data = { lines: empty ? [] : [line] };
    else if (path === '/operations/usage/summary') data = { totalItems: empty ? 0 : 1, missingItems: 0, totalQuantityUsed: line.quantityUsed };
    else if (path === '/operations/usage') { expect(body.lines[0].expectedVersion).toBe('v1'); line = { ...line, ...body.lines[0], closingQty: 10 - body.lines[0].quantityUsed, expectedVersion: 'v2' }; data = {}; }
    else if (path === '/operations/snapshots') data = empty ? [] : [{ ...line, date: '2026-10-02' }];
    else if (path === '/operations/tasks/assignees') data = [{ id: 'u1', name: 'Warehouse colleague' }];
    else if (path === '/operations/owner-dashboard') data = { aiRequestsToday: 3, backupLastStatus: 'success', backupLastAt: '2026-10-02T00:00:00Z', backupLastSizeBytes: 2048, lowStockCount: 0, outOfStockCount: 0, pendingDamageCount: 0, spendLast7Days: 0, exceptions: [], staffPerformance: [] };
    else if (path === '/operations/tasks/performance') data = tasks.map(t => ({ staffId: t.staffId, staffName: t.staffName, completed: t.status === 'completed' ? 1 : 0, pending: t.status === 'assigned' ? 1 : 0, rejected: t.status === 'rejected' ? 1 : 0 }));
    else if (path === '/operations/tasks') { if (method === 'POST') { task = { ...task, ...body, id: 't2', status: 'assigned' }; tasks = [...tasks, task]; } data = tasks.filter(t => !url.searchParams.get('status') || t.status === url.searchParams.get('status')); }
    else if (path.includes('/tasks/t1/')) { expect(body.expectedVersion).toBe(task.version); task = { ...task, status: path.endsWith('/accept') ? 'accepted' : body.rejected ? 'rejected' : 'completed', correctionNote: body.correctionNote ?? '', version: 'v2' }; tasks = [task]; data = task; }
    else if (path === '/operations/reports/summary') data = { method: 'RULE-BASED', items: empty ? [] : [{ id: 'c1', name: 'Rice', movementStatus: 'active', agingBucket: 'healthy', lastMovementAt: '2026-10-01', used7d: 0, used30d: 0 }], supplierFrequency: empty ? [] : [{ supplierId: 's1', supplierName: 'Business supplier', purchaseCount: 2 }] };
    else if (path === '/notifications/unread-count') data = { count: 0 };
    await route.fulfill({ json: data });
  });
  return { calls, failReads: (value: boolean) => { failure = value; }, failWrites: (value: boolean) => { writesFail = value; } };
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('main')!.scrollWidth <= document.querySelector('main')!.clientWidth)).toBe(true);
const viewports = [[390, 844], [393, 852], [412, 915], [1366, 768], [1440, 900], [1920, 1080]];
for (const role of ['Owner', 'Manager', 'Staff'] as const) for (const [width, height] of viewports) {
  test(role + ' backup, history and help at ' + width + 'x' + height, async ({ page }, info) => {
    await page.setViewportSize({ width, height }); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await fixture(page, role, role === 'Manager'); await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    if (role === 'Owner') await expect(page.getByText('AI requests today (UTC): 3')).toBeVisible();
    if (role === 'Staff') { await expect(page.getByRole('link', { name: 'Export & Backup', exact: true })).toHaveCount(0); await page.goto('/settings/backup'); await expect(page.getByRole('heading', { name: 'Access unavailable' })).toBeVisible(); }
    else {
      await page.getByRole('link', { name: 'Export & Backup', exact: true }).last().click(); await expect(page.getByRole('heading', { name: 'Export & Backup', exact: true })).toBeVisible();
      if (role === 'Manager') { await expect(page.getByText('No server backups recorded yet.')).toBeVisible(); await expect(page.getByLabel('Backup JSON', { exact: true })).toHaveCount(0); }
      else await expect(page.getByText('backup_20261002T000000Z_test.json')).toBeVisible();
      await noOverflow(page); await page.screenshot({ path: info.outputPath('backup.png') });
      const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Stock Excel', exact: true }).click(); expect((await download).suggestedFilename()).toBe('business-test.bin'); await expect(page.getByRole('status')).toContainText('Download started.');
      await page.getByRole('button', { name: 'Run server backup' }).click(); await expect(page.getByRole('status')).toContainText('Server business backup completed.'); await expect(page.getByText('backup_20261002T010000Z_test.json')).toBeVisible();
      if (role === 'Owner') { await page.getByLabel('Backup JSON', { exact: true }).fill('{"businessId":"b1"}'); await page.getByRole('button', { name: 'Validate backup' }).click(); await expect(page.getByText('Backup structure is valid. No writes performed.')).toBeVisible(); }
      await noOverflow(page);
    }
    await page.goto('/settings/help'); await expect(page.getByRole('heading', { name: 'How to use this app', exact: true })).toBeVisible();
    const stock = page.locator('summary').filter({ hasText: /^Stock$/ }); await stock.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('link', { name: 'Try it · Stock', exact: true })).toBeVisible();
    await noOverflow(page); await page.screenshot({ path: info.outputPath('help.png') }); await page.getByRole('link', { name: 'Try it · Stock', exact: true }).click(); await expect(page).toHaveURL(/inventory\/all/); expect(errors).toEqual([]);
  });
}
test('backup loading, recoverable history errors and failed runs stay distinct', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); const controls = await fixture(page, 'Owner');
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/exports/backup/logs', async route => { await pending; await route.fulfill({ json: { items: [] } }); });
  await page.goto('/settings/backup'); await expect(page.getByText('Loading backup history…')).toBeVisible(); release(); await expect(page.getByText('No server backups recorded yet.')).toBeVisible();
  await page.unroute('**/exports/backup/logs'); controls.failReads(true); await page.reload(); await expect(page.getByRole('button', { name: 'Retry history' })).toBeVisible();
  controls.failReads(false); await page.getByRole('button', { name: 'Retry history' }).click(); await expect(page.getByText('backup_20261002T000000Z_test.json')).toBeVisible();
  controls.failWrites(true); await page.getByRole('button', { name: 'Run server backup' }).click(); await expect(page.getByRole('alert')).toContainText('Server backup could not be completed. Try again.');
  controls.failWrites(false); await page.getByRole('button', { name: 'Run server backup' }).click(); await expect(page.getByRole('status')).toContainText('Server business backup completed.'); await noOverflow(page);
});
test('automatic daily JSON is deduplicated across reloads and can be disabled', async ({ page }) => {
  const { calls } = await fixture(page, 'Owner'); await page.goto('/settings/backup'); const first = page.waitForEvent('download');
  await page.getByLabel('Download JSON once daily when this app opens').check(); await first; await expect(page.getByRole('status')).toContainText('Automatic daily JSON download enabled.');
  await page.reload(); await expect(page.getByLabel('Download JSON once daily when this app opens')).toBeChecked(); expect(calls.filter(c => c === 'GET /exports/backup.json')).toHaveLength(1);
  await page.getByLabel('Download JSON once daily when this app opens').uncheck(); await page.reload(); await expect(page.getByLabel('Download JSON once daily when this app opens')).not.toBeChecked();
});
for (const [width, height] of viewports) test('owner selected purchase CSV at ' + width + 'x' + height, async ({ page }) => {
  await page.setViewportSize({ width, height }); await page.context().grantPermissions(['clipboard-read', 'clipboard-write']); await fixture(page, 'Owner');
  await page.route('**/api/v1/purchases?*', route => route.fulfill({ json: { data: [{ id: 'p1', orderNumber: 'PO-CSV', supplierName: 'Supplier, quoted', status: 1, deliveryState: 0, grandTotal: 10.25, remainingAmount: 7.35, createdAt: '2026-10-02T00:00:00Z', version: 1 }], totalCount: 1, totalPages: 1 } }));
  await page.goto('/purchases/list'); await expect(page.getByRole('button', { name: 'Copy selected CSV' })).toBeDisabled(); await page.getByLabel('Select PO-CSV', { exact: true }).check();
  await page.getByRole('button', { name: 'Copy selected CSV' }).click(); await expect(page.getByRole('status')).toContainText('Selected purchases copied as CSV.');
  const csv = await page.evaluate(() => navigator.clipboard.readText()); expect(csv).toContain('human_id,purchase_date,supplier,total_inr,remaining_inr,status'); expect(csv).toContain('10.25,7.35'); await noOverflow(page);
});
for (const role of ['Manager', 'Staff'] as const) test(role + ' cannot copy financial purchase CSV', async ({ page }) => {
  await fixture(page, role); await page.goto('/purchases/list'); await expect(page.getByRole('button', { name: 'Copy selected CSV' })).toHaveCount(0);
});
for (const role of ['Owner', 'Manager', 'Staff'] as const) for (const [width, height] of viewports) {
  test(role + ' operations and settings at ' + width + 'x' + height, async ({ page }, info) => {
    await page.setViewportSize({ width, height }); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const { calls } = await fixture(page, role); page.on('dialog', d => d.accept());
    await page.goto('/operations'); await expect(page.getByRole('heading', { name: 'Daily Operations', exact: true })).toBeVisible();
    await expect(page.getByText('Team progress:', { exact: false })).toBeVisible(); await noOverflow(page);
    await page.getByLabel('Opening stock check notes').fill('Checked'); await page.getByLabel('Opening stock check', { exact: true }).click(); await expect(page.getByLabel('Opening stock check', { exact: true })).toBeChecked();
    await expect(page.getByRole('status')).toContainText('Checklist task completed.');
    await page.getByRole('button', { name: 'Accept task', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Task accepted.');
    await page.getByRole('button', { name: 'Complete task', exact: true }).click(); await page.getByLabel('Correction note (optional)').fill('Verified');
    await page.getByRole('button', { name: 'Confirm completion' }).click(); await expect(page.getByRole('status')).toContainText('Task completed.');
    if (role === 'Staff') { await expect(page.getByRole('button', { name: 'Assign task', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Edit checklist templates' })).toHaveCount(0); await expect(page.getByLabel('Rice quantity used')).toBeDisabled(); }
    else { await page.getByRole('button', { name: 'Edit checklist templates' }).click(); await page.getByLabel('Task 1 description').fill('Opening verification'); await page.getByRole('button', { name: 'Save templates' }).click(); await expect(page.getByRole('status')).toContainText('Checklist templates saved.');
      await page.getByLabel('Rice quantity used').fill('2'); await page.getByLabel('Rice usage notes').fill('Used for work'); await page.getByRole('button', { name: 'Save daily usage' }).click(); await expect(page.getByRole('status')).toContainText('Daily usage saved.'); }
    await page.getByLabel('From date').fill('2026-10-01'); await page.getByLabel('Snapshot item').selectOption('c1'); await noOverflow(page);
    if (role === 'Staff') {
      await expect(page.getByRole('heading', { name: 'Stock movement summary', exact: true })).toHaveCount(0);
      expect(calls.filter(c => c === 'GET /operations/reports/summary')).toHaveLength(0);
    } else {
      await page.getByRole('heading', { name: 'Stock movement summary', exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByText('Business supplier: 2 purchases')).toBeVisible();
    }
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('operations-summary.png') }); await page.locator('main').evaluate(el => el.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('operations.png'), fullPage: true });
    await page.goto('/settings'); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.getByLabel('Your name').fill('Updated colleague'); await page.getByRole('button', { name: 'Save personal profile' }).click(); await expect(page.getByRole('status')).toContainText('Personal profile saved.');
    if (role === 'Owner') { await page.getByLabel('Business name', { exact: true }).fill('Harisree Agency Warehouse'); await page.getByRole('button', { name: 'Save profile', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Business profile saved.');
      await page.getByLabel('Credential type').selectOption('openai_key'); await page.getByLabel('New credential value').fill('browser-only-test-key-1234'); await page.getByRole('button', { name: 'Save credential', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Provider credential saved.'); await expect(page.getByLabel('New credential value')).toHaveValue(''); }
    else { await expect(page.getByLabel('Business name', { exact: true })).toBeDisabled(); await expect(page.getByRole('heading', { name: 'API credentials' })).toHaveCount(0); expect(calls.some(c => c.includes('/settings/credentials'))).toBe(false); }
    await page.getByLabel('Delivery updates').uncheck(); expect(calls.filter(c => c === 'PUT /settings/notifications')).toHaveLength(0); await page.getByRole('button', { name: 'Save notifications' }).click(); await expect(page.getByRole('status')).toContainText('Notification preferences saved.');
    await page.getByLabel('Your name').fill('Discarded'); await page.getByRole('button', { name: 'Cancel personal edits' }).click(); await expect(page.getByLabel('Your name')).toHaveValue('Updated colleague');
    await noOverflow(page); await page.getByRole('heading', { name: 'Workspace', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('settings-workspace.png') }); await page.locator('main').evaluate(el => el.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath('settings.png'), fullPage: true });
    await page.setViewportSize({ width, height: 360 }); await page.getByLabel('Your name').fill('Keyboard edit'); const save = page.getByRole('button', { name: 'Save personal profile' }); await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport(); await noOverflow(page);
    expect(errors).toEqual([]);
  });
}
test('operations and settings recover from load failures and preserve failed edits', async ({ page }) => {
  const fixtureState = await fixture(page, 'Owner'); fixtureState.failReads(true); await page.goto('/operations'); await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 }); fixtureState.failReads(false); await page.getByRole('button', { name: 'Retry', exact: true }).click(); await expect(page.getByLabel('Rice quantity used')).toBeVisible();
  await page.goto('/settings'); await page.getByLabel('Your name').fill('Preserved draft'); fixtureState.failWrites(true); await page.getByRole('button', { name: 'Save personal profile' }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('Your name')).toHaveValue('Preserved draft'); fixtureState.failWrites(false); await page.getByRole('button', { name: 'Retry', exact: true }).click(); await page.getByRole('button', { name: 'Save personal profile' }).click(); await expect(page.getByRole('status')).toContainText('Personal profile saved.');
});
test('empty operations and rejected tasks have useful states', async ({ page }) => {
  await fixture(page, 'Staff', true); await page.goto('/operations'); await expect(page.getByText('No active catalog items.', { exact: false })).toBeVisible(); await expect(page.getByText('No tasks match this status.', { exact: false })).toBeVisible(); await expect(page.getByText('No snapshots for this period.', { exact: false })).toBeVisible();
});
test('owner assigns work, staff rejection persists a note, and saves disable duplicate submission', async ({ page }) => {
  const { calls } = await fixture(page, 'Owner'); await page.goto('/operations');
  await page.getByRole('button', { name: 'Reject task', exact: true }).click(); await page.getByLabel('Correction note (optional)').fill('Incorrect stock reference'); await page.getByRole('button', { name: 'Confirm rejection' }).click(); await expect(page.getByText('Note: Incorrect stock reference')).toBeVisible();
  await page.getByRole('button', { name: 'Assign task', exact: true }).click(); await page.getByLabel('Assigned member').selectOption('u1'); await page.getByLabel('Task type').fill('Delivery check'); await page.getByLabel('Reference ID (optional)').fill('PO-1'); await page.getByRole('button', { name: 'Save assignment' }).click(); await expect(page.getByText('Delivery check · assigned')).toBeVisible();
  expect(calls.filter(c => c === 'POST /operations/tasks')).toHaveLength(1);
  await page.goto('/settings'); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let saves = 0;
  await page.route('**/api/v1/settings/profile', async route => { if (route.request().method() !== 'PUT') return route.fallback(); saves++; await gate; await route.fulfill({ json: { id: 'u1', name: 'Saved once', email: 'colleague@example.test' } }); });
  await page.getByLabel('Your name').fill('Saved once'); const save = page.getByRole('button', { name: 'Save personal profile' }); await save.click(); await expect(save).toBeDisabled(); await expect(page.getByLabel('Your name')).toBeDisabled(); release(); await expect(page.getByRole('status')).toContainText('Personal profile saved.'); expect(saves).toBe(1);
});
