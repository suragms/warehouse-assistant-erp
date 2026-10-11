import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { navigationFixture } from './navigation-fixture';

const shots = '../TestResults/responsive-ui/all-pages-workflows';
async function fixtures(page: Page) {
  await navigationFixture(page, 'Owner');
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', ''); let data: unknown;
    if (path === '/catalog/categories') data = [{ id: 'cat1', name: 'Grains', itemCount: 1 }];
    else if (path === '/catalog/categories/cat1/types') data = [{ id: 't1', categoryId: 'cat1', name: 'Rice type', itemCount: 1 }];
    else if (path === '/catalog/brokers') data = [{ id: 'b1', name: 'Broker A', isActive: true, linkedSuppliersCount: 0 }];
    else if (path === '/catalog/suppliers/s1/history') data = { items: [], totalCount: 0 };
    else if (path === '/users') data = [{ id: 'u2', name: 'Staff member', email: 'staff@example.test', role: 4, status: 0, createdAt: '2026-10-02' }];
    else if (path === '/users/u2/permissions') data = { permissions: ['stock.view'], defaultPermissions: ['stock.view'] };
    if (data !== undefined) return route.fulfill({ json: data }); return route.fallback();
  });
}
for (const [width, height] of [[320,700],[360,800],[390,844],[427,952],[768,1024],[1024,768],[1366,768],[1920,1080]]) {
  test(`catalog and account dialogs fit and preserve keyboard focus ${width}x${height}`, async ({ page }) => {
    test.setTimeout(90000); await page.setViewportSize({ width, height }); await fixtures(page); mkdirSync(shots, { recursive: true });
    const cases = [
      ['/catalog/categories', 'New Category', 'New Category'], ['/catalog/categories', 'Edit Grains', 'Edit Category'], ['/catalog/categories', 'Delete Grains', 'Delete Category'],
      ['/catalog/types', 'New Type', 'New Type'], ['/suppliers', 'New Supplier', 'New Supplier'], ['/suppliers', 'Manage items for Supplier A', 'Items supplied by Supplier A'], ['/suppliers', 'History', 'Purchase history · Supplier A'], ['/suppliers', 'Edit Supplier A', 'Edit Supplier'], ['/suppliers', 'Delete Supplier A', 'Delete Supplier'],
      ['/brokers', 'New Broker', 'New Broker'], ['/brokers', 'Edit Broker A', 'Edit Broker'], ['/brokers', 'Delete Broker A', 'Delete Broker'],
      ['/users', 'Add User', 'Add New User'], ['/users', 'Edit User', 'Edit User'], ['/users', 'Edit Permissions', 'Manage Permissions'], ['/users', 'Share / Copy Credentials', 'Login credentials'],
    ];
    for (const [path, trigger, title] of cases) {
      await page.goto(path);
      if (path === '/catalog/types') await page.getByRole('combobox', { name: 'Filter category' }).selectOption('cat1');
      const opener = page.getByRole('button', { name: trigger, exact: true }); await opener.click();
      const dialog = page.getByRole('dialog', { name: title, exact: true }); await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.width).toBeLessThanOrEqual(width); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Shift+Tab'); expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Tab'); expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true);
      await page.screenshot({ path: `${shots}/${width}-${title.replaceAll(' ', '-')}.png`, animations: 'disabled' });
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  });
}
test('reports isolate failed data and tabs support arrow keys', async ({ page }) => {
  await fixtures(page); await page.route('**/api/v1/reports/stock-analytics**', route => route.fulfill({ status: 503, json: { message: 'Unavailable' } }));
  await page.goto('/reports'); const spend = page.getByRole('tab', { name: 'Spend Analytics' }); await expect(spend).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('No spend data recorded for this date range.')).toBeVisible();
  await spend.focus(); await page.keyboard.press('End'); await expect(page.getByRole('tab', { name: 'Stock & Inventory' })).toBeFocused();
  await expect(page.getByText('Stock analytics could not be loaded.')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Home'); await expect(spend).toBeFocused(); await expect(page.getByText('No spend data recorded for this date range.')).toBeVisible();
});
test('global search exposes network failure, then navigates to a guarded contact detail', async ({ page }) => {
  await fixtures(page); let fail = true;
  await page.route('**/api/v1/catalog/search**', route => fail ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { items: [], suppliers: [{ id: 's1', name: 'Supplier A' }], brokers: [], categories: [] } }));
  await page.route('**/api/v1/catalog/suppliers/s1', route => route.fulfill({ json: { id: 's1', name: 'Supplier A', phone: '12345', isActive: true } }));
  await page.goto('/dashboard'); await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible(); await page.keyboard.press('Control+k'); const dialog = page.getByRole('dialog'); await dialog.getByRole('combobox').fill('Supplier');
  await expect(dialog.getByText(/Search could not be loaded/)).toBeVisible({ timeout: 15000 }); fail = false; await dialog.getByRole('button', { name: /Retry/ }).click();
  await dialog.getByRole('option').first().click(); await expect(page).toHaveURL(/suppliers\/s1/); await expect(page.getByRole('heading', { name: 'Supplier A', exact: true })).toBeVisible();
});
test('notification read failure stays visible and never navigates away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await fixtures(page);
  await page.route('**/api/v1/notifications/n1/read', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/dashboard'); await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('button', { name: /Delivery ready/ }).click(); await expect(page.getByText('Read status could not be saved. Try again.')).toBeVisible(); await expect(page).toHaveURL(/dashboard/);
});
test('Admin can use role-default catalog controls but audit role restriction remains explicit', async ({ page }) => {
  await navigationFixture(page, 'Admin'); await page.goto('/catalog/categories'); await expect(page.getByRole('button', { name: 'New Category' })).toBeVisible();
  await page.goto('/catalog/types'); await expect(page.getByRole('button', { name: 'New Type' })).toBeVisible();
  await page.goto('/audit'); await expect(page.getByText('Audit history requires the Owner or SuperAdmin role.')).toBeVisible();
});
test('busy dialogs fit a reduced keyboard viewport, and dark theme survives reload', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 400 }); await fixtures(page); await page.goto('/users');
  await page.getByRole('button', { name: 'Use dark theme' }).click(); await page.getByRole('button', { name: 'Add User' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add New User' }); await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox(); expect(box!.height).toBeLessThanOrEqual(368); await dialog.getByLabel('Full Name').fill('Staff member');
  await dialog.getByRole('button', { name: 'Create User', exact: true }).scrollIntoViewIfNeeded(); await expect(dialog.getByRole('button', { name: 'Create User', exact: true })).toBeVisible();
  await page.screenshot({ path: `${shots}/dark-short-dialog.png` }); await page.keyboard.press('Escape'); await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Use light theme' })).toBeVisible();
});

test('primary controls and summary captions meet text contrast in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 }); await fixtures(page); await page.goto('/dashboard');
  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: theme === 'light' ? 'Use dark theme' : 'Use light theme' }).click();
    const targets = [page.getByRole('button', { name: 'New Purchase', exact: true }), page.locator('main .text-slate-400').first(), page.locator('main .text-indigo-600').filter({ hasText: '0' }).first()];
    for (const target of targets) {
      await expect(target).toBeVisible(); const ratio = await target.evaluate(element => {
        const rgba = (value: string) => { const n = value.match(/[\d.]+/g)!.map(Number); return [n[0], n[1], n[2], n[3] ?? 1]; };
        const parents: Element[] = []; for (let p: Element | null = element; p; p = p.parentElement) parents.unshift(p);
        let background = [255, 255, 255];
        for (const p of parents) { const color = rgba(getComputedStyle(p).backgroundColor); background = background.map((v, i) => color[i] * color[3] + v * (1 - color[3])); }
        const foreground = rgba(getComputedStyle(element).color).slice(0, 3);
        const lum = (rgb: number[]) => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const a = lum(foreground), b = lum(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      }); expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('keyboard permission edits restore defaults and revoke custom grants only after explicit save', async ({ page }) => {
  await fixtures(page); let permissions = ['catalog.create']; const patches: unknown[] = [];
  await page.route('**/api/v1/users/u2/permissions', async route => {
    if (route.request().method() === 'PATCH') { const patch = route.request().postDataJSON(); patches.push(patch); permissions = [...permissions.filter(p => !patch.revoke.includes(p)), ...patch.grant]; return route.fulfill({ json: { data: true } }); }
    return route.fulfill({ json: { permissions, defaultPermissions: ['stock.view'] } });
  });
  await page.goto('/users'); await page.getByRole('button', { name: 'Edit Permissions', exact: true }).click();
  const stock = page.getByRole('switch', { name: 'View Stock' }); await expect(stock).toHaveAttribute('aria-checked', 'false'); await stock.focus(); await page.keyboard.press('Space'); await expect(stock).toHaveAttribute('aria-checked', 'true');
  const create = page.getByRole('switch', { name: 'Create Items' }); await create.focus(); await page.keyboard.press('Space'); await expect(create).toHaveAttribute('aria-checked', 'false'); expect(patches).toEqual([]);
  await page.getByRole('button', { name: 'Save changes' }).click(); await expect(page.getByText('Permissions saved successfully.')).toBeVisible(); expect(patches).toEqual([{ grant: ['stock.view'], revoke: ['catalog.create'] }]);
  await expect(stock).toHaveAttribute('aria-checked', 'true'); await expect(create).toHaveAttribute('aria-checked', 'false');
});

for (const theme of ['light', 'dark']) {
  test(`permission labels remain readable in every override state: ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await fixtures(page);
    await page.addInitScript(value => localStorage.setItem('warehouse-theme', value), theme);
    await page.route('**/api/v1/users/u2/permissions', route => route.fulfill({ json: { permissions: ['catalog.create', 'catalog.edit'], defaultPermissions: ['catalog.edit', 'catalog.archive'] } }));
    await page.goto('/users'); await page.getByRole('button', { name: 'Edit Permissions', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Manage Permissions' });
    for (const name of ['View Catalog', 'Create Items', 'Edit Items', 'Archive Items']) {
      const control = dialog.getByRole('switch', { name, exact: true }); await control.scrollIntoViewIfNeeded();
      for (const label of [control.locator('span').first(), control.locator('span').last()]) {
        const result = await label.evaluate(element => {
          const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
          const rgba = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); const bytes = context.getImageData(0, 0, 1, 1).data; return [bytes[0], bytes[1], bytes[2], bytes[3] / 255]; };
          const parents: Element[] = []; for (let p: Element | null = element; p; p = p.parentElement) parents.unshift(p);
          let background = [255, 255, 255], opacity = 1;
          for (const parent of parents) { const style = getComputedStyle(parent), color = rgba(style.backgroundColor); background = background.map((v, i) => color[i] * color[3] + v * (1 - color[3])); opacity *= Number(style.opacity); }
          const foreground = rgba(getComputedStyle(element).color).slice(0, 3);
          const luminance = (rgb: number[]) => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
          const a = luminance(foreground), b = luminance(background);
          return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), opacity };
        });
        expect(result.opacity, `${theme} ${name}: full-opacity text`).toBe(1); expect(result.ratio, `${theme} ${name}: readable label contrast`).toBeGreaterThanOrEqual(4.5);
      }
    }
    await dialog.getByRole('switch', { name: 'View Catalog', exact: true }).scrollIntoViewIfNeeded();
    mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${theme}-permission-states.png`, animations: 'disabled' });
  });
}
