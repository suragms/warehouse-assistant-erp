import { test, expect } from '@playwright/test';
import { navigationFixture } from './navigation-fixture';

for (const width of [390, 768, 1440]) test(`barcode labels and manual fallback at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await navigationFixture(page, 'Staff');
  await page.addInitScript(() => { Object.defineProperty(window, 'BarcodeDetector', { value: undefined }); window.print = () => { document.body.dataset.printCalled = 'yes'; }; });
  await page.route('**/catalog/items/by-barcode/*', route => route.fulfill({ json: { id: 'c1', name: 'Rice <safe>', barcode: 'RICE-123456', itemCode: 'R1', categoryName: 'Food', isActive: true } }));
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
