import { test, expect, type Page, type Locator } from '@playwright/test';
import { navigationFixture } from './navigation-fixture';
const sizes = [[390, 844], [393, 852], [412, 915]];
const routes = [['/inventory/overview', 'Stock Overview', 'Stock'], ['/purchases/overview', 'Purchase Engine Dashboard', 'Purchases'], ['/dashboard', 'Dashboard', 'Home'], ['/inventory/all', 'Inventory', 'Stock'], ['/purchases/list', 'Purchase Orders', 'Purchases'], ['/purchases/new', 'Create Purchase Order', 'Purchases'], ['/purchases/p1', 'PO-NAV', 'Purchases'], ['/suppliers', 'Suppliers', 'More'], ['/reports', 'Reports & Analytics', 'Reports'], ['/operations', 'Daily Operations', 'More'], ['/notifications', 'Notifications & Alerts', 'More'], ['/settings', 'Settings', 'More'], ['/users', 'User Management', 'More']] as const;
async function geometry(page: Page) {
  expect(await page.evaluate(() => {
    const main = document.querySelector('main')!, header = document.querySelector('header')!, bar = document.querySelector('[aria-label="Mobile navigation"]')!;
    const m = main.getBoundingClientRect(), h = header.getBoundingClientRect(), b = bar.getBoundingClientRect();
    return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth && m.top >= h.bottom && m.bottom <= b.top + 1 && b.bottom <= innerHeight;
  })).toBe(true);
}
async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport();
  expect(await control.evaluate(element => {
    const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === element || element.contains(hit);
  }), 'control must receive a touch rather than the fixed navigation').toBe(true);
}
for (const role of ['Owner', 'Manager', 'Staff'] as const) for (const [width, height] of sizes) {
  test(`mobile navigation ${role} ${width}x${height}`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height }); const calls = await navigationFixture(page, role);
    await page.goto('/dashboard'); const bar = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /interactive-widget=resizes-content/);
    await expect(bar).toBeVisible(); await expect(bar.getByRole('link')).toHaveCount(role === 'Staff' ? 3 : 4);
    await expect(bar.getByRole('button', { name: 'More', exact: true })).toBeVisible();
    await expect(page.locator('header').getByAltText('Harisree Agency logo')).toBeVisible();
    await expect(page.locator('header').getByText('Harisree Agency', { exact: true })).toBeVisible();
    const bell = page.locator('header').getByRole('button', { name: 'Notifications', exact: true });
    await expect(bell).toHaveAccessibleDescription('12 unread notifications');
    await expect(bell.getByText('9+', { exact: true })).toBeVisible();
    const touchTargets = bar.locator('a, button').or(page.locator('header').locator('a, button').filter({ visible: true }));
    for (const target of await touchTargets.all()) { const box = await target.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44); }
    await bell.click(); await expect(bell).toHaveAttribute('aria-expanded', 'true');
    const preview = page.getByRole('region', { name: 'Notification preview' }); await expect(preview.getByText('Delivery ready')).toBeVisible();
    await preview.getByRole('button', { name: /View all notifications/ }).click(); await expect(page).toHaveURL(/notifications$/); await expect(preview).toHaveCount(0);
    await page.locator('header').getByRole('link', { name: 'Settings', exact: true }).click(); await expect(page).toHaveURL(/settings$/);
    if (role !== 'Owner') { await expect(page.getByLabel('Business name', { exact: true })).toBeDisabled(); await expect(page.getByRole('heading', { name: 'API credentials' })).toHaveCount(0); }
    const more = bar.getByRole('button', { name: 'More', exact: true });
    await more.click(); const dialog = page.getByRole('dialog', { name: 'More', exact: true });
    await expect(more).toHaveAttribute('aria-expanded', 'true'); await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused();
    await expect(dialog.getByRole('heading', { name: 'Operations', exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Suppliers', exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Users', exact: true })).toHaveCount(role === 'Staff' ? 0 : 1);
    await expect(dialog.getByRole('link', { name: 'Duplicates', exact: true })).toHaveCount(role === 'Staff' ? 0 : 1);
    await expect(dialog.getByRole('link', { name: 'Export & Backup', exact: true })).toHaveCount(role === 'Staff' ? 0 : 1);
    const links = await dialog.locator('a').evaluateAll(items => items.map(item => item.getAttribute('href')));
    expect(new Set(links).size).toBe(links.length); expect(links).not.toContain('/inventory/all'); expect(links).not.toContain('/purchases/list');
    const bounds = await dialog.boundingBox(), barBounds = await bar.boundingBox(); expect(bounds!.y + bounds!.height).toBeLessThan(barBounds!.y);
    await page.screenshot({ path: info.outputPath('more.png') });
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused();
    await page.screenshot({ path: info.outputPath('more-bottom.png') });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(more).toBeFocused();
    await more.click(); await page.mouse.click(2, 80); await expect(dialog).toHaveCount(0);
    await more.click(); await dialog.getByRole('link', { name: 'Suppliers', exact: true }).click(); await expect(page).toHaveURL(/suppliers$/); await expect(dialog).toHaveCount(0); await expect(more).toHaveAttribute('aria-expanded', 'false');
    for (const [route, heading, active] of routes) {
      await page.goto(route); const denied = role === 'Staff' && ['/reports', '/users'].includes(route);
      await expect(page.getByRole('heading', { name: denied ? 'Access unavailable' : heading, exact: true })).toBeVisible();
      if (!denied) await expect(bar.getByRole(active === 'More' ? 'button' : 'link', { name: active, exact: true })).toHaveAttribute('aria-current', 'page');
      await geometry(page);
    }
    expect(calls.filter(call => call.startsWith('POST ') && !call.includes('/auth/') && !call.includes('/realtime/'))).toEqual([]);
    expect(errors).toEqual([]); await page.screenshot({ path: info.outputPath('mobile.png') });
  });
  test(`keyboard forms ${role} ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 360 }); const calls = await navigationFixture(page, role);
    await page.goto('/purchases/new'); await page.getByLabel('Enter purchase request').fill('Review rice'); await reachable(page.getByRole('button', { name: 'Preview Purchase', exact: true })); await geometry(page);
    await page.goto('/suppliers');
    if (role === 'Staff') await expect(page.getByRole('button', { name: 'New Supplier', exact: true })).toHaveCount(0);
    else {
      await page.getByRole('button', { name: 'New Supplier', exact: true }).click(); const supplier = page.getByRole('dialog', { name: 'New Supplier', exact: true });
      await supplier.getByLabel('Supplier Name').fill('Keyboard fixture'); await supplier.getByLabel('Notes').fill('Synthetic form only'); await reachable(supplier.getByRole('button', { name: 'Save', exact: true })); await supplier.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    if (role !== 'Staff') { await page.goto('/users'); await page.getByRole('button', { name: 'Add User', exact: true }).click(); await page.getByLabel('Full Name').fill('Keyboard colleague'); await reachable(page.getByRole('button', { name: 'Create User', exact: true })); }
    else { await page.goto('/users'); await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible(); }
    await page.goto('/settings'); await page.getByLabel('Your name').fill('Keyboard colleague'); await reachable(page.getByRole('button', { name: 'Save personal profile', exact: true })); await geometry(page);
    await page.screenshot({ path: info.outputPath('keyboard-settings.png') });
    await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} })); await page.goto('/login'); await page.getByLabel('Email address').fill('keyboard@example.test'); await page.getByLabel('Password', { exact: true }).fill('fixture-password'); await reachable(page.getByRole('button', { name: 'Sign in', exact: true }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(calls.filter(call => ['POST', 'PUT', 'PATCH', 'DELETE'].some(method => call.startsWith(method + ' ')) && !call.includes('/auth/') && !call.includes('/realtime/'))).toEqual([]);
  });
}
for (const role of ['Owner', 'Manager', 'Staff'] as const) test(`constrained viewport and simulated safe areas ${role}`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 360 }); await navigationFixture(page, role); await page.goto('/dashboard');
  await page.addStyleTag({ content: '.app-shell { --mobile-safe-area-bottom: 20px; --mobile-safe-area-top: 16px; }' });
  await geometry(page); const bar = page.getByRole('navigation', { name: 'Mobile navigation', exact: true }); expect((await bar.boundingBox())!.height).toBe(84);
  await bar.getByRole('button', { name: 'More', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'More', exact: true });
  await reachable(dialog.getByRole('link', { name: 'How to use this app', exact: true }));
  await dialog.getByRole('link', { name: 'How to use this app', exact: true }).click(); await expect(page).toHaveURL(/settings\/help$/); await geometry(page);
});
test('membership overrides hide each unauthorized mobile route; direct routes remain guarded', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); await navigationFixture(page, 'Manager', ['stock.view']); await page.goto('/dashboard');
  const bar = page.getByRole('navigation', { name: 'Mobile navigation', exact: true }); await expect(bar.getByRole('link')).toHaveCount(2);
  await bar.getByRole('button', { name: 'More', exact: true }).click(); const links = page.getByRole('dialog').getByRole('link');
  for (const label of ['Suppliers', 'Brokers', 'Items', 'New Purchase', 'Users', 'Export & Backup']) await expect(links.filter({ hasText: label })).toHaveCount(0);
  await page.goto('/purchases/new'); await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigationFixture(page, 'Manager', ['purchase.create', 'catalog.edit']); await page.goto('/dashboard');
  await expect(bar.getByRole('link', { name: 'Purchases', exact: true })).toHaveCount(0); await bar.getByRole('button', { name: 'More', exact: true }).click();
  const menu = page.getByRole('dialog'); await expect(menu.getByRole('link', { name: 'New Purchase', exact: true })).toBeVisible(); await expect(menu.getByRole('link', { name: 'Duplicates', exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Items', exact: true })).toHaveCount(0);
  await navigationFixture(page, 'Staff', ['reports.view']); await page.goto('/dashboard'); await bar.getByRole('button', { name: 'More', exact: true }).click();
  await expect(menu.getByRole('link', { name: 'Export & Backup', exact: true })).toHaveCount(0);
});
test('scoped SuperAdmin uses existing authorized navigation', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); await navigationFixture(page, 'SuperAdmin'); await page.goto('/dashboard');
  await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Users', exact: true })).toBeVisible();
});

test('long account email keeps mobile Settings fields and actions inside the main viewport', async ({ page }) => {
  await navigationFixture(page, 'Owner');
  const email = 'owner-' + 'a'.repeat(32) + '@example.test';
  await page.route('**/api/v1/settings/profile', route => route.fulfill({ json: { id: 'u1', name: 'Warehouse colleague', email } }));
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height: Math.min(height, 360) });
    await page.goto('/settings');
    await expect(page.getByText(email + ' · Owner', { exact: true })).toBeVisible();
    await geometry(page);
    const field = page.getByLabel('Your name', { exact: true });
    expect(await field.evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth; })).toBe(true);
    await reachable(page.getByRole('button', { name: 'Save personal profile', exact: true }));
  }
});
