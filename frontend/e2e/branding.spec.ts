import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const viewports = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function mockSession(page: Page, authenticated = false) {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) {
      return route.fulfill(authenticated ? {
        json: { data: { accessToken: 'mock-session', user: {
          id: 'u1', name: 'Reviewer', email: 'review@example.test', businesses: [],
          currentBusiness: { businessId: 'b1', businessName: 'Harisree Agency', role: 'Owner', permissions: [] },
        } } },
      } : { status: 401, json: { error: 'SESSION_EXPIRED' } });
    }
    return route.fulfill({ json: path.endsWith('/dashboard') ? {
      operationalAlerts: [], recentPurchases: [], recentStockActivity: [],
    } : { data: [], count: 0 } });
  });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function loadedLogos(page: Page) {
  const logos = page.getByRole('img', { name: 'Harisree Agency logo' });
  for (const logo of await logos.all()) {
    if (!await logo.isVisible()) continue;
    await expect(logo).toHaveJSProperty('complete', true);
    await expect(logo).toHaveJSProperty('naturalWidth', 235);
    await expect(logo).toHaveJSProperty('naturalHeight', 195);
    expect(await logo.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain');
  }
}

for (const viewport of viewports) {
  test(`login branding and validation at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockSession(page);
    await page.goto('/login');
    await expect(page).toHaveTitle('Warehouse Assistant | Harisree Agency');
    await expect(page.getByRole('heading', { name: 'Warehouse Assistant', exact: true })).toBeVisible();
    await expect(page.getByText('Harisree Agency', { exact: true })).toBeVisible();
    await expect(page.getByText('For sign-in help, contact your business owner.', { exact: true })).toBeVisible();
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Forgot password?', exact: true })).toHaveAttribute('href', '/forgot-password');
    await expect(page.getByRole('link', { name: /sign.?up|register/i })).toHaveCount(0);
    await loadedLogos(page);
    const backgroundUrl = await page.getByTestId('login-background').evaluate(element => {
      const style = getComputedStyle(element);
      if (style.backgroundSize !== 'cover') throw new Error('Login background must cover without stretching');
      return style.backgroundImage.slice(5, -2);
    });
    const response = await page.request.get(backgroundUrl);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/webp');
    await expect(page.getByLabel('Email address')).toBeInViewport();
    await expect(page.getByLabel('Password', { exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeInViewport();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Invalid email address', { exact: true })).toBeVisible();
    await expect(page.getByText('Password is required', { exact: true })).toBeVisible();
    await noOverflow(page);
  });

  test(`dashboard, navigation and error branding at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockSession(page, true);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Warehouse Assistant | Harisree Agency');
    const brand = viewport.width < 768 ? page.locator('header') : page.locator('body');
    await expect(brand.getByText('Warehouse Assistant', { exact: true }).filter({ visible: true })).toBeVisible();
    await loadedLogos(page);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
    if (viewport.width < 768) await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Open search', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    if (viewport.width < 768) {
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await expect(page.getByRole('navigation', { name: 'More navigation' })).toBeVisible();
      await loadedLogos(page);
      const close = page.getByRole('button', { name: 'Close navigation', exact: true });
      await expect(close).toBeInViewport();
      await noOverflow(page);
      await page.screenshot({ path: testInfo.outputPath('drawer.png'), fullPage: true });
      await close.click();
    }
    await page.goto('/missing-page');
    await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
    await expect(page.getByText('Warehouse Assistant', { exact: true }).filter({ visible: true })).toBeVisible();
    await noOverflow(page);
  });
}

test('login remains scrollable with a reduced keyboard viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await mockSession(page);
  await page.goto('/login');
  await page.getByLabel('Email address').fill('review@example.test');
  await page.getByLabel('Password', { exact: true }).focus();
  await page.keyboard.type('test-password');
  await expect(page.getByLabel('Password', { exact: true })).toBeInViewport();
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('keyboard-viewport.png'), fullPage: true });
});

test('production icons, manifest and service-worker offline branding', async ({ page, context }) => {
  await mockSession(page);
  await page.goto('/offline.html');
  await page.evaluate(async () => {
    const oldCache = await caches.open('purchase-assistant-shell-v2');
    await oldCache.put('/favicon.svg', new Response('old starter artwork', { headers: { 'Content-Type': 'image/svg+xml' } }));
  });
  await page.goto('/login');
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    name: 'Warehouse Assistant', short_name: 'Warehouse Assistant',
    description: 'Warehouse management and purchase operations for Harisree Agency.',
  });
  for (const size of [192, 512]) {
    expect(manifest.icons).toContainEqual({ src: `/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' });
    const icon = await page.request.get(`/icon-${size}.png`);
    expect(icon.ok()).toBe(true);
    expect(icon.headers()['content-type']).toContain('image/png');
    const bytes = await icon.body();
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
    expect(bytes.equals(await readFile(new URL(`../../icons/Icon-${size}.png`, import.meta.url)))).toBe(true);
  }
  const favicon = await page.request.get('/favicon.png');
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()['content-type']).toContain('image/png');
  const originalFavicon = await readFile(new URL('../../favicon.png', import.meta.url));
  expect((await favicon.body()).equals(originalFavicon)).toBe(true);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.png');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('type', 'image/png');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icon-192.png');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cacheKeys = await page.evaluate(() => caches.keys());
  expect(cacheKeys).toContain('purchase-assistant-shell-v3');
  expect(cacheKeys).not.toContain('purchase-assistant-shell-v2');
  const cachedAssets = await page.evaluate(async () => {
    const cache = await caches.open('purchase-assistant-shell-v3');
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  });
  expect(cachedAssets).toEqual(expect.arrayContaining(['/offline.html', '/manifest.webmanifest', '/favicon.png', '/icon-192.png', '/icon-512.png']));
  expect(cachedAssets).not.toContain('/favicon.svg');
  await context.setOffline(true);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Connection required' })).toBeVisible();
  await expect(page.getByText('Warehouse Assistant', { exact: true })).toBeVisible();
  await expect(page.getByText('Harisree Agency', { exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Warehouse Assistant | Harisree Agency');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.png');
  for (const path of ['/favicon.png', '/icon-192.png', '/icon-512.png']) {
    const cached = await page.evaluate(async assetPath => {
      const response = await fetch(assetPath);
      return { ok: response.ok, type: response.headers.get('Content-Type'), bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
    }, path);
    expect(cached.ok).toBe(true);
    expect(cached.type).toContain('image/png');
    const originalPath = path === '/favicon.png' ? '../../favicon.png' : `../../icons/Icon-${path.includes('192') ? 192 : 512}.png`;
    expect(Buffer.from(cached.bytes).equals(await readFile(new URL(originalPath, import.meta.url)))).toBe(true);
  }
});
