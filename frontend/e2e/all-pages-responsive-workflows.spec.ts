import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { allPagesFixture, allPagesViewports } from './all-pages-fixture';

test.use({ actionTimeout: 15000 });
const directory = '../TestResults/responsive-ui/all-pages-populated';
async function readable(page: Page) {
  const result = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, width: innerWidth, main: document.querySelector('main')!.scrollWidth, mainWidth: document.querySelector('main')!.clientWidth,
    tables: Array.from(document.querySelectorAll('table')).filter(t => t.getClientRects().length).map(t => ({ contained: !!t.closest('.erp-table-scroll'), headers: Array.from(t.querySelectorAll('th')).map(h => getComputedStyle(h).whiteSpace) })) }));
  expect(result.document).toBeLessThanOrEqual(result.width + 1); expect(result.main).toBeLessThanOrEqual(result.mainWidth + 1);
  for (const table of result.tables) { expect(table.contained).toBe(true); expect(table.headers.every(h => h === 'nowrap')).toBe(true); }
  await expect(page.getByRole('heading', { name: 'This page could not be opened' })).toHaveCount(0);
}
async function singleNumericLine(value: Locator) {
  await expect(value).toBeVisible();
  const lines = await value.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length; });
  expect(lines, 'A financial/stock value must stay intact instead of splitting its digits').toBe(1);
}
for (const [width, height] of allPagesViewports) test(`populated business records and nested reports remain readable ${width}x${height}`, async ({ page }) => {
  test.setTimeout(180000); await page.setViewportSize({ width, height }); const { item, order } = await allPagesFixture(page, width === 390 || width === 1024 ? 'dark' : 'light');
  const errors: string[] = [], inventoryWrites: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/\/api\/v1\/(stock|purchases)/.test(r.url()) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) inventoryWrites.push(r.method() + ' ' + r.url()); }); mkdirSync(directory, { recursive: true });
  for (const path of ['/inventory/all', '/inventory/low-stock', '/inventory/out-of-stock', '/catalog/items', '/suppliers', '/brokers', '/users', '/purchases/list', '/dashboard', '/purchases/overview']) {
    await page.goto(path); await expect(page.getByRole('heading').first()).toBeVisible();
    if (width < 768) {
      await expect(page.locator('.erp-record-card').first()).toBeVisible(); expect(await page.locator('main table').count()).toBe(0);
      const card = page.locator('.erp-record-card').first(); const title = card.locator('.erp-record-title'); expect((await title.boundingBox())!.width).toBeGreaterThanOrEqual(150);
      if (path.startsWith('/inventory/')) for (const field of ['System stock', 'Physical stock', 'Reserved', 'Available', 'Reorder level']) await expect(card.getByText(field, { exact: true })).toBeVisible();
    } else await expect(page.getByRole('table').first()).toBeVisible();
    if (path === '/purchases/list') { await page.getByRole('checkbox', { name: 'Select all purchases on this page' }).check(); await expect(page.getByRole('checkbox', { name: 'Select ' + order.orderNumber })).toBeChecked(); await expect(page.getByRole('button', { name: 'Copy selected CSV' })).toBeEnabled(); }
    if (path === '/dashboard' || path === '/purchases/overview') await singleNumericLine(page.getByText('₹13,23,580.39', { exact: true }));
    await readable(page); if (width < 768 && (path === '/inventory/all' || path === '/purchases/list')) await page.locator('.erp-record-card').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${directory}/${width}${path.replaceAll('/', '_')}.png`, animations: 'disabled' });
  }
  await page.getByRole('button', { name: /^Inspect/ }).first().click(); await expect(page).toHaveURL(/purchases\/p1/); await readable(page); await page.goBack(); await expect(page).toHaveURL(/purchases\/overview/);
  await page.route('**/api/v1/stock/c1', route => route.fulfill({ json: { ...item, systemStock: 12345.75, physicalStock: 12340, reservedStock: 5, availableStock: 12340.75 } }));
  await page.goto('/inventory/c1'); await singleNumericLine(page.getByText('12345.75', { exact: true })); await readable(page);
  await page.screenshot({ path: `${directory}/${width}_large-stock-values.png`, animations: 'disabled' });
  await page.route('**/api/v1/purchases/p1', route => route.fulfill({ json: { ...order, status: 4 } }));
  await page.goto('/purchases/p1'); await expect(page.getByRole('heading', { name: order.orderNumber, exact: true })).toBeVisible();
  if (width < 768) { await expect(page.getByRole('region', { name: 'Purchase items and receipts' })).toBeVisible(); await expect(page.locator('.erp-record-card').filter({ hasText: item.name }).first()).toContainText('12345.75 KG'); }
  const receive = page.getByRole('spinbutton', { name: /Receive quantity/ }).first(); await receive.scrollIntoViewIfNeeded(); await expect(receive).toBeEditable(); await readable(page);
  await page.goto('/reports'); await expect(page.getByRole('region', { name: 'Spend over time' })).toBeVisible(); await singleNumericLine(page.getByText('₹13,23,580.39', { exact: true })); await singleNumericLine(page.getByText('₹8,377.09', { exact: true })); await readable(page);
  await page.getByRole('tab', { name: 'Purchase Summaries' }).click(); await expect(page.getByText(order.supplierName, { exact: true })).toBeVisible(); await readable(page);
  await page.getByRole('tab', { name: 'Stock & Inventory' }).click(); await expect(page.getByText('Total Catalog Items', { exact: true })).toBeVisible(); await readable(page);
  await page.goto('/ml?itemId=c1'); await expect(page.getByRole('heading', { name: item.name, exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Prediction outcomes' }).click(); await expect(page.getByRole('region', { name: 'Prediction outcomes comparison' })).toBeVisible(); await readable(page);
  await page.getByText('Import historical consumption', { exact: true }).click(); await page.getByLabel('Consumption CSV').setInputFiles({ name: 'history.csv', mimeType: 'text/csv', buffer: Buffer.from('fixture historic CSV') }); await page.getByLabel('Trusted source description').fill('Trusted fixture source for UI preview'); await page.getByRole('checkbox', { name: /I have verified complete daily consumption/ }).check();
  await page.route('**/ml/history/preview', route => route.fulfill({ json: { totalRows: 1, validRows: 1, errorCount: 0, errors: [], sample: [{ row: 1, itemId: 'saved-catalog-identifier-with-long-literal-UUID', date: '2026-10-02', quantity: 12345.6789, unit: 'KG' }], canCommit: true, previewToken: 'fixture' } }));
  await page.getByRole('button', { name: 'Preview consumption import', exact: true }).click(); await expect(page.getByRole('region', { name: 'Historical consumption import preview' })).toBeVisible(); await readable(page);
  await page.goto('/catalog/barcodes'); await page.getByLabel('Scan or enter barcode').fill(item.barcode!); await page.getByLabel('Scan or enter barcode').press('Enter'); await expect(page.getByRole('img', { name: `Barcode label ${item.barcode}` })).toBeVisible(); await readable(page);
  await page.goto('/settings'); await expect(page.getByRole('heading', { name: 'Password and sessions' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'AI provider routing' })).toBeVisible(); await readable(page);
  await page.goto('/settings/backup'); const exportButton = page.getByRole('button', { name: /^Download .*PDF$/ }).first(); await exportButton.scrollIntoViewIfNeeded(); await expect(exportButton).toBeVisible(); await readable(page);
  const last = page.locator('main button:enabled').last(); await last.scrollIntoViewIfNeeded(); const box = await last.boundingBox(); if (width < 768) { const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y + 1); }
  expect(inventoryWrites).toEqual([]); expect(errors).toEqual([]);
});
