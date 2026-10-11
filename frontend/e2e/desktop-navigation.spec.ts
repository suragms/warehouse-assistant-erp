import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { navigationFixture } from './navigation-fixture';
const directory = resolve(process.env.NAV_BASELINE_DIR || '../TestResults/mobile-desktop-baseline');
const routes = [['/inventory/overview', 'Stock Overview'], ['/purchases/overview', 'Purchase Engine Dashboard'], ['/dashboard', 'Dashboard'], ['/inventory/all', 'Inventory'], ['/purchases/list', 'Purchase Orders'], ['/reports', 'Reports & Analytics'], ['/settings', 'Settings'], ['/users', 'User Management'], ['/notifications', 'Notifications & Alerts']] as const;
for (const role of ['Owner', 'Manager', 'Staff'] as const) for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
  test(`desktop navigation preserved ${role} ${width}x${height}`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height }); await navigationFixture(page, role);
    for (const [route, heading] of routes) {
      await page.goto(route);
      const denied = role === 'Staff' && ['/reports', '/users'].includes(route);
      await expect(page.getByRole('heading', { name: denied ? 'Access unavailable' : heading, exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true }).filter({ visible: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open search', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (route === '/dashboard') {
        await page.getByAltText('Harisree Agency logo').evaluateAll(images => Promise.all(images.map(img => (img as HTMLImageElement).decode())));
        for (const [label, locator] of [['header', page.locator('header')], ['sidebar', page.getByRole('navigation', { name: 'Main navigation', exact: true })]] as const) {
          const shot = await locator.screenshot({ animations: 'disabled' });
          writeFileSync(info.outputPath(`${label}.png`), shot);
          const path = resolve(directory, `${role}-${width}-${label}.png`);
          if (process.env.NAV_BASELINE === '1') { mkdirSync(directory, { recursive: true }); writeFileSync(path, shot); }
          else if (process.env.NAV_COMPARE_BASELINE === '1' && existsSync(path)) expect(shot.equals(readFileSync(path)), `${label} pixels must match the explicitly selected desktop baseline`).toBe(true);
        }
        await page.screenshot({ path: info.outputPath('desktop.png'), animations: 'disabled' });
      }
    }
    expect(errors).toEqual([]);
  });
}
