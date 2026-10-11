import { test, expect } from '@playwright/test';
import { allPagesFixture } from './all-pages-fixture';

for (const [width, height] of [[320, 700], [1366, 768]]) {
  test(`dashboard purchase link creates one history entry ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await allPagesFixture(page);
    await page.goto('/dashboard');
    const purchase = page.getByRole('link', { name: 'PO-NAV', exact: true });
    for (const keyboard of [false, true]) {
      await expect(purchase).toBeVisible();
      if (keyboard) { await purchase.focus(); await purchase.press('Enter'); }
      else await purchase.click();
      await expect(page).toHaveURL(/\/purchases\/p1$/);
      await page.goBack();
      await expect(page).toHaveURL(/\/dashboard$/);
    }
    if (width >= 768) {
      await page.getByRole('row').filter({ has: purchase }).click();
      await expect(page).toHaveURL(/\/purchases\/p1$/);
      await page.goBack();
      await expect(page).toHaveURL(/\/dashboard$/);
    }
  });

  test(`purchase selection is scoped to the visible page and filters ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const { order } = await allPagesFixture(page);
    await page.route('**/api/v1/purchases?**', route => {
      const current = Number(new URL(route.request().url()).searchParams.get('page') || 1);
      return route.fulfill({ json: {
        data: [{ ...order, id: current === 1 ? 'p1' : 'p2', orderNumber: `PO-PAGE-${current}` }],
        meta: { page: current, pageSize: 20, totalCount: 21, totalPages: 2 },
      } });
    });
    await page.goto('/purchases/list');
    const copy = page.getByRole('button', { name: 'Copy selected CSV' });
    await page.getByRole('checkbox', { name: 'Select PO-PAGE-1', exact: true }).check();
    await expect(copy).toBeEnabled();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Select PO-PAGE-2', exact: true })).not.toBeChecked();
    await expect(copy).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Select PO-PAGE-2', exact: true }).check();
    await page.getByRole('textbox', { name: 'Search purchase orders' }).fill('PO');
    await expect(page.getByRole('checkbox', { name: 'Select PO-PAGE-1', exact: true })).not.toBeChecked();
    await expect(copy).toBeDisabled();
  });
}
