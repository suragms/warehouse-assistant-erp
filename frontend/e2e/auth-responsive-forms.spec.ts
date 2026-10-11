import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { allPagesFixture, allPagesViewports } from './all-pages-fixture';

for (const theme of ['light', 'dark'] as const) for (const [width, height] of allPagesViewports) {
  test(`public recovery forms and supported reset link ${theme} ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await allPagesFixture(page, theme);
    await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
    await page.route('**/api/v1/auth/forgot-password', route => route.fulfill({ status: 202, json: { message: 'If eligible, instructions will be queued.' } }));
    const resets: unknown[] = [];
    await page.route('**/api/v1/auth/reset-password', route => {
      resets.push(route.request().postDataJSON());
      return route.fulfill({ json: { message: 'Password changed. Sign in again on each device.' } });
    });
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('colleague@example.test');
    await page.getByRole('button', { name: 'Request reset instructions' }).click();
    await expect(page.getByRole('status')).toContainText('queued');
    await page.goto('/reset-password#email=colleague%40example.test&token=responsive-fixture-token');
    await expect(page.getByLabel('Email')).toHaveValue('colleague@example.test');
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm new password')).toBeVisible();
    mkdirSync('../TestResults/responsive-ui/all-pages-auth', { recursive: true });
    await page.screenshot({ path: `../TestResults/responsive-ui/all-pages-auth/${theme}-${width}-reset-form.png` });
    const geometry = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, main: document.querySelector('main')!.scrollWidth, mainWidth: document.querySelector('main')!.clientWidth }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.main).toBeLessThanOrEqual(geometry.mainWidth + 1);
    await page.getByLabel('New password', { exact: true }).fill('responsive-fixture-password');
    await page.getByLabel('Confirm new password').fill('different-fixture-password');
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Passwords must match');
    expect(resets).toEqual([]);
    await page.getByLabel('Confirm new password').fill('responsive-fixture-password');
    const change = page.getByRole('button', { name: 'Change password', exact: true });
    await change.scrollIntoViewIfNeeded();
    const box = await change.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    await change.click();
    await expect(page.getByRole('status')).toContainText('Password changed');
    expect(resets).toEqual([{ email: 'colleague@example.test', token: 'responsive-fixture-token', newPassword: 'responsive-fixture-password' }]);
  });
}
