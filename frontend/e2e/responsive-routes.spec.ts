import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { allPagesFixture, allPagesViewports } from './all-pages-fixture';

export const routeCases = [
  '/', '/dashboard', '/catalog/items', '/catalog/items/new', '/catalog/items/c1', '/catalog/items/c1/edit',
  '/catalog/categories', '/catalog/types', '/catalog/barcodes', '/catalog/duplicates', '/suppliers', '/suppliers/s1', '/brokers', '/brokers/b2',
  '/inventory', '/inventory/overview', '/inventory/all', '/inventory/low-stock', '/inventory/out-of-stock',
  '/inventory/c1', '/inventory/c1/activity', '/purchases', '/purchases/overview', '/purchases/list', '/purchases/new',
  '/purchases/p1', '/purchases/p1/edit', '/reports', '/ml', '/audit', '/notifications', '/operations',
  '/settings', '/settings/backup', '/settings/help', '/users', '/missing-page', '/login', '/forgot-password', '/reset-password?token=fixture&email=colleague%40example.test',
];
const phase = process.env.UI_AUDIT_PHASE || 'all-pages-after';
const shots = resolve('../TestResults/responsive-ui', phase);
for (const theme of ['light', 'dark'] as const) for (const [width, height] of allPagesViewports) {
 test(`registered routes ${theme} ${width}x${height}`, async ({ page }) => {
  test.setTimeout(180000); await page.setViewportSize({ width, height }); await allPagesFixture(page, theme);
  const prefix = theme === 'dark' ? 'dark-' : '';
  const measurements: unknown[]=[]; const errors: string[]=[]; page.on('pageerror', error=>errors.push(error.message));
  mkdirSync(shots,{ recursive:true });
  for (const path of routeCases) {
   await page.goto(path); await expect(page.getByRole('heading').first()).toBeVisible();
   await page.locator('main, #root').first().waitFor(); if (phase !== 'before') await expect(page.getByRole('heading', { name: 'This page could not be opened' })).toHaveCount(0);
   await page.waitForTimeout(150);
   const geometry = await page.evaluate(()=>({ document:document.documentElement.scrollWidth, viewport:innerWidth, main:(document.querySelector('main') ?? document.querySelector('#root'))?.scrollWidth, mainWidth:(document.querySelector('main') ?? document.querySelector('#root'))?.clientWidth, text:(document.querySelector('main') ?? document.querySelector('#root'))?.textContent?.length ?? 0, tables: Array.from(document.querySelectorAll<HTMLTableElement>('table')).filter(t => t.getClientRects().length).map(t => ({ width:t.clientWidth, headers: Array.from(t.querySelectorAll('th')).filter(h => h.textContent?.trim()).map(h => ({ text:h.textContent?.trim(), width:h.clientWidth, lineHeight:parseFloat(getComputedStyle(h).lineHeight), height:h.clientHeight, wrap:getComputedStyle(h).whiteSpace })), contained: !!t.closest('.erp-table-scroll') })), unnamedFields: Array.from(document.querySelectorAll<HTMLInputElement>('main input:not([type=hidden]):not([type=submit]):not([type=button]), main select, main textarea')).filter(e => e.getClientRects().length && !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title).map(e => ({ tag:e.tagName, type:e.type, placeholder:e.getAttribute('placeholder'), name:e.name })) }));
   measurements.push({ path,...geometry });
   writeFileSync(resolve(shots,`${prefix}${width}-measurements.json`),JSON.stringify({ measurements,errors },null,2));
   await page.screenshot({ path:resolve(shots,`${prefix}${width}-${path.replace(/[^a-z0-9]/gi,'_')}.png`), animations:'disabled' });
   if (phase !== 'before') { expect(geometry.document, path).toBeLessThanOrEqual(width+1); expect(geometry.main ?? 0,path).toBeLessThanOrEqual((geometry.mainWidth ?? 0)+1); expect(geometry.text,path).toBeGreaterThan(15); expect(geometry.unnamedFields,path).toEqual([]); for(const table of geometry.tables) { expect(table.contained, `${path}: comparison table has a contained scroll region`).toBe(true); for(const header of table.headers) expect(header.wrap, `${path}: readable ${header.text} heading`).toBe('nowrap'); } }
  }
  writeFileSync(resolve(shots,`${prefix}${width}-measurements.json`),JSON.stringify({ measurements,errors },null,2));
  if (phase !== 'before') expect(errors).toEqual([]);
 });
}
