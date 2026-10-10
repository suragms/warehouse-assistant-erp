import { test, expect } from '@playwright/test';
import { navigationFixture } from './navigation-fixture';

for (const width of [390, 1440]) {
  test(`Export Center separate filters and download at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); const calls = await navigationFixture(page, 'Owner');
    let parameters: URLSearchParams | undefined;
    await page.route('**/api/v1/exports/reports/files/**', route => {
      parameters = new URL(route.request().url()).searchParams;
      return route.fulfill({ body: 'browser-download-fixture', contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment; filename="warehouse_purchases_2026-10-10.pdf"', 'Access-Control-Expose-Headers': 'Content-Disposition' } });
    });
    await page.goto('/settings/backup'); await expect(page.getByRole('heading', { name: 'Export Center', exact: true })).toBeVisible();
    await expect(page.getByLabel('From date (UTC)')).toBeDisabled();
    await page.getByRole('combobox', { name: 'Report', exact: true }).selectOption('purchases');
    await page.getByLabel('From date (UTC)').fill('2026-10-01'); await page.getByLabel('Through date (UTC)').fill('2026-10-10');
    await page.getByRole('combobox', { name: 'Report status', exact: true }).selectOption('Confirmed');
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download Purchase orders PDF', exact: true }).click();
    const download = await pending; expect(download.suggestedFilename()).toBe('warehouse_purchases_2026-10-10.pdf');
    expect(parameters?.get('start')).toBe('2026-10-01T00:00:00.000Z'); expect(parameters?.get('end')).toBe('2026-10-10T23:59:59.999999Z'); expect(parameters?.get('status')).toBe('Confirmed');
    expect(calls.filter(c => c.includes('stock.adjust') || c.includes('receive'))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/export-center-${width}.png`, fullPage: true });
  });
}
test('Export Center reports useful server failures and keeps the download action available', async ({ page }) => {
  await navigationFixture(page, 'Manager'); await page.route('**/api/v1/exports/reports/files/**', route => route.fulfill({ status: 413, json: { message: 'Narrow the export to 5,000 rows.' } }));
  await page.goto('/settings/backup'); await page.getByRole('button', { name: 'Download Current stock PDF', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Narrow the export to 5,000 rows.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Current stock PDF', exact: true })).toBeEnabled();
});
test('Export Center history reflects generated reports and handles empty results', async ({ page }) => {
  await navigationFixture(page, 'Owner'); await page.route('**/api/v1/exports/reports/history', route => route.fulfill({ json: { items: [{ id: 'h', createdAt: '2026-10-10T00:00:00Z', status: 'generated', details: { report: 'stock', format: 'pdf', rowCount: 25 } }] } }));
  await page.goto('/settings/backup'); await expect(page.getByText(/25 records · Generated/)).toBeVisible();
  await expect(page.getByText(/server creation; browser saving/)).toBeVisible();
});
