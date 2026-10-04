import { test, expect } from '@playwright/test';
import { navigationFixture } from './navigation-fixture';

for (const width of [320, 768, 1440]) test(`Historical consumption preview and confirmation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await navigationFixture(page, 'Owner');
  await page.route('**/api/v1/ml/items?*', route => route.fulfill({ json: { items: [], totalCount: 0 } }));
  const calls: string[] = [];
  await page.route('**/api/v1/ml/history/*', route => {
    const path = new URL(route.request().url()).pathname; calls.push(path);
    return route.fulfill({ json: path.endsWith('/preview') ? { totalRows: 1, validRows: 1, errorCount: 0, errors: [], sample: [{ row: 2, itemId: 'fixture-item', date: '2026-10-02', quantity: 5, unit: 'PCS' }], canCommit: true, previewToken: 'fixture-proof' } : { importedRows: 1 } });
  });
  await page.goto('/ml'); await page.getByText('Import historical consumption', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview consumption import' })).toBeDisabled();
  await page.getByLabel('Consumption CSV').setInputFiles({ name: 'synthetic-workflow-fixture.csv', mimeType: 'text/csv', buffer: Buffer.from('business_id,warehouse_id,item_id,date,quantity,unit,transaction_type,recorded_at\nb1,b1,fixture-item,2026-10-02,5,PCS,consumption_daily_total,2026-10-02T23:00:00Z') });
  await page.getByLabel('Trusted source description').fill('Synthetic browser workflow fixture only');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Preview consumption import' }).click();
  await expect(page.getByText('1/1 valid rows. 0 validation errors.')).toBeVisible(); expect(calls).toEqual(['/api/v1/ml/history/preview']);
  await page.getByRole('button', { name: 'Confirm historical import' }).click(); await expect(page.getByText('Imported 1 daily consumption records. Current stock was not changed.')).toBeVisible();
  expect(calls).toEqual(['/api/v1/ml/history/preview', '/api/v1/ml/history/commit']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
});

test('Monitoring degradation presents a review alert and does not retrain', async ({ page }) => {
  await navigationFixture(page, 'Owner');
  const calls: string[] = [];
  await page.route('**/api/v1/ml/**', route => {
    const path = new URL(route.request().url()).pathname; calls.push(route.request().method() + ' ' + path);
    const json = path.endsWith('/items') ? { items: [{ id: 'c1', name: 'Rice', itemCode: 'R1' }], totalCount: 1 }
      : path.endsWith('/monitoring-summary') ? [{ modelVersion: 'fixture-only-model', horizon: 7, completedForecasts: 10, mae: 35, rmse: 49.5, wape: .5, mape: .5, recentMae: 70, previousMae: 0, reviewAlert: true, message: 'Review data and model; retraining is never automatic.' }]
        : path.endsWith('/monitoring') ? [] : { itemId: 'c1', itemName: 'Rice', unit: 'PCS', currentStock: 100, status: 'insufficient_history', message: 'Insufficient history', history: [], forecast: [], anomalies: [] };
    return route.fulfill({ json });
  });
  await page.goto('/ml'); await page.getByRole('combobox', { name: 'Item', exact: true }).selectOption('c1'); await page.getByRole('button', { name: 'Prediction outcomes' }).click();
  await expect(page.getByRole('alert')).toContainText('retraining is never automatic'); expect(calls.every(c => c.startsWith('GET '))).toBeTruthy();
});
