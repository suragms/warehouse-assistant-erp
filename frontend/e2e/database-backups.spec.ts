import { test, expect } from '@playwright/test';
import { navigationFixture } from './navigation-fixture';
for (const width of [390, 768, 1440]) test(`database backup settings, progress and recovery at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); const calls = await navigationFixture(page, 'SuperAdmin');
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; const requests: string[] = [];
  const data = { canRecover: true, overview: { settings: { id: 1, revision: 'r1', dailyEnabled: false, dailyHour: 2, dailyMinute: 0, monthlyEnabled: false, monthlyDay: 31, monthlyHour: 3, monthlyMinute: 0, timeZone: 'Asia/Kolkata', dailyRetention: 14, monthlyRetention: 12, manualRetention: 10 }, health: { ready: true, destination: 'Protected server storage', durability: 'persistent', offsiteConfigured: false, warnings: ['offsite_copy_not_configured'] }, lastSuccessful: '2026-10-10T10:01:00Z', jobs: [{ id: 'verify-job', kind: 'verify', sourceId: id, status: 'succeeded', stage: 'Verified', createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), sizeBytes: 0, verifiedAt: new Date().toISOString(), pinned: false, offsiteVerified: false, attempts: 1 }, { id, kind: 'manual', status: 'succeeded', stage: 'Encrypted archive ready', createdAt: '2026-10-10T10:00:00Z', completedAt: '2026-10-10T10:01:00Z', sha256: 'A'.repeat(64), sizeBytes: 1234, verifiedAt: '2026-10-10T10:01:00Z', pinned: false, offsiteVerified: false, attempts: 1 }], liveRestoreEnabled: false } };
  await page.route('**/exports/backup/logs', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/exports/database-backups**', async route => {
    const path = new URL(route.request().url()).pathname; requests.push(route.request().method() + ' ' + path);
    if (path.endsWith('/settings')) { Object.assign(data.overview.settings, route.request().postDataJSON()); return route.fulfill({ json: data.overview.settings }); }
    if (path.endsWith('/recovery-preflight')) return route.fulfill({ json: { message: 'Archive pinned. Isolated restore required.' } });
    if (route.request().method() === 'POST') return route.fulfill({ status: 202, json: { id: 'j2', status: 'queued' } });
    return route.fulfill({ json: data });
  });
  await page.goto('/settings/backup'); await expect(page.getByRole('button', { name: 'Create Backup Now' })).toBeVisible();
  await expect(page.getByText('Automatic database backups are disabled.')).toBeVisible();
  await page.getByLabel('Enable monthly server backups').check(); await page.getByRole('button', { name: 'Save backup schedules' }).click(); await expect(page.getByText('Server schedules saved.')).toBeVisible();
  expect(data.overview.settings.monthlyEnabled).toBe(true); expect(data.overview.settings.dailyEnabled).toBe(false);
  await page.getByLabel('Recovery archive').selectOption(id); await expect(page.getByRole('button', { name: 'Prepare guided recovery' })).toBeDisabled();
  await page.getByLabel(/I authorize recovery preparation/).check(); await page.getByRole('button', { name: 'Prepare guided recovery' }).click(); await expect(page.getByText('Archive pinned. Isolated restore required.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(calls.filter(c => /^(POST|PUT|PATCH|DELETE) \/(stock|purchases)/.test(c))).toEqual([]);
  expect(requests.some(r => r.endsWith('/recovery-preflight'))).toBe(true);
  await page.getByRole('button', { name: 'Create Backup Now' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('database-backups.png'), fullPage: true });
});
