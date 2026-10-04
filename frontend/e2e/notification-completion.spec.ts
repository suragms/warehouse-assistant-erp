import { test, expect } from '@playwright/test';
import { navigationFixture } from './navigation-fixture';
test('purchase and prediction notifications open the referenced records with keyboard access', async ({ page }) => {
  await navigationFixture(page, 'Owner');
  await page.route('**/api/v1/notifications?*', route => route.fulfill({ json: { data: [
    { id: 'n1', title: 'Purchase created', message: 'Review the draft', referenceType: 'PurchaseOrder', referenceId: 'p1', isRead: true, createdAt: '2026-10-03' },
    { id: 'n2', title: 'Forecast stock alert', message: 'Review the forecast', referenceType: 'MlPrediction', referenceId: 'c1', isRead: true, createdAt: '2026-10-03' },
  ] } }));
  await page.route('**/api/v1/ml/items?*', route => route.fulfill({ json: { items: [{ id: 'c1', name: 'Rice', itemCode: 'R1' }], totalCount: 1 } }));
  await page.route('**/api/v1/ml/items/c1?*', route => route.fulfill({ json: { itemId: 'c1', itemName: 'Rice', unit: 'kg', currentStock: 5, status: 'insufficient_history', message: 'Insufficient historical data', history: [], forecast: [], anomalies: [] } }));
  await page.goto('/notifications'); const order = page.getByRole('button', { name: /Purchase created Review the draft/ }); await order.focus(); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/purchases\/p1$/);
  await page.goto('/notifications'); await page.getByRole('button', { name: /Forecast stock alert Review the forecast/ }).click(); await expect(page).toHaveURL(/ml\?itemId=c1$/); await expect(page.getByText('Insufficient historical data', { exact: true })).toBeVisible();
});
test('notification read errors offer retry and never display an empty success state', async ({ page }) => {
  await navigationFixture(page, 'Staff');
  await page.route('**/api/v1/notifications?*', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/notifications'); await expect(page.getByRole('button', { name: 'Retry notifications' })).toBeVisible({ timeout: 12000 }); await expect(page.getByText("You're completely up to date!")).toHaveCount(0);
});
