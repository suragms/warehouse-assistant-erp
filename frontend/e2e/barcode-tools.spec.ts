import { test, expect } from '@playwright/test';
import { navigationFixture } from './navigation-fixture';

for (const width of [390, 768, 1440]) test(`barcode labels and manual fallback at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await navigationFixture(page, 'Staff');
  await page.addInitScript(() => { Object.defineProperty(window, 'BarcodeDetector', { value: undefined }); window.print = () => { document.body.dataset.printCalled = 'yes'; }; });
  await page.route('**/catalog/items/by-barcode?*', route => route.fulfill({ json: { id: 'c1', name: 'Rice <safe>', barcode: 'RICE-123456', itemCode: 'R1', categoryName: 'Food', isActive: true } }));
  await page.goto('/catalog/barcodes');
  await expect(page.getByText(/Camera barcode scanning is not supported/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Assign Barcode to Item' })).toHaveCount(0);
  await page.getByLabel('Scan or enter barcode').fill('RICE-123456'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  const label = page.getByRole('img', { name: 'Barcode label RICE-123456' }); await expect(label).toBeVisible();
  expect(await label.locator('rect').count()).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Print barcode label / Save PDF' }).click(); await expect(page.locator('body')).toHaveAttribute('data-print-called', 'yes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ media: 'print' }); await expect(page.locator('header')).not.toBeVisible(); await expect(label).toBeVisible();
  await page.screenshot({ path: info.outputPath('printed-label.png') });
});

test('camera denial keeps manual lookup available and does not start repeated requests', async ({ page }) => {
  await navigationFixture(page, 'Owner');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BarcodeDetector', { value: class { async detect() { return []; } } });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => { throw new Error('Permission denied'); } } });
  });
  await page.goto('/catalog/barcodes'); await page.getByRole('button', { name: 'Scan with camera' }).click();
  await expect(page.getByText('Camera access is unavailable or was denied. Enter the barcode instead.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan with camera' })).toBeVisible(); await expect(page.getByLabel('Scan or enter barcode')).toBeEditable();
});

for (const width of [390, 1440]) test(`versioned barcode assignment and batch print at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); const calls = await navigationFixture(page, 'Owner');
  await page.addInitScript(() => { Object.defineProperty(window, 'BarcodeDetector', { value: undefined }); window.print = () => { document.body.dataset.printCalled = 'yes'; }; });
  const item = { id: 'c1', name: 'Rice <safe>', barcode: 'OLD', itemCode: 'R01', categoryId: 'food', categoryName: 'Food', defaultUnit: 'KG', currentStock: 25, isActive: true, rowVersion: 'v1' };
  const second = { ...item, id: 'c2', name: 'Wheat', itemCode: 'W1', barcode: 'WHEAT-001' };
  const archived = { ...item, id: 'c3', name: 'Archived rice', barcode: 'ARCHIVED', isActive: false };
  const requests: unknown[] = [];
  await page.route('**/catalog/items?*', route => route.fulfill({ json: { data: [item, second, archived], meta: { page: 1, pageSize: 50, totalCount: 3, totalPages: 1 } } }));
  await page.route('**/catalog/items/c1/barcode', route => {
    const body = route.request().postDataJSON(); requests.push(body);
    return route.fulfill({ json: { ...item, barcode: body.barcode, rowVersion: 'v2' } });
  });
  await page.goto('/catalog/barcodes'); await page.getByLabel('Search Item').fill('Rice');
  await page.getByRole('button', { name: /Rice <safe>.*Code: R01/ }).click();
  await page.getByLabel('New Barcode').fill('NEW-001'); await page.getByLabel('New Barcode').press('Enter');
  await expect(page.getByText('Barcode saved. Stock is unchanged.')).toBeVisible();
  expect(requests).toEqual([{ barcode: 'NEW-001', expectedVersion: 'v1' }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/catalog/items');
  await page.getByRole('checkbox', { name: 'Print label for Rice <safe>' }).check();
  await page.getByRole('checkbox', { name: 'Print label for Wheat' }).check();
  await expect(page.getByRole('checkbox', { name: 'Print label for Archived rice' })).toBeDisabled();
  await page.getByRole('button', { name: 'Print 2 selected labels / Save PDF' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('header')).not.toBeVisible();
  await expect(page.locator('.barcode-print-root svg')).toHaveCount(2);
  await expect(page.locator('.barcode-print-root')).toContainText('Rice <safe>');
  await expect(page.locator('.barcode-print-root')).toContainText('Wheat');
  const labels = await page.locator('.barcode-print-root .barcode-label-print').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
  expect(labels[1].top).toBeGreaterThanOrEqual(labels[0].bottom);
  await page.screenshot({ path: info.outputPath('batch-labels.png') });
  expect(calls.filter(c => /^(POST|PUT|PATCH|DELETE) \/(stock|purchases)/.test(c))).toEqual([]);
});
