import { test, expect } from '@playwright/test';
import { navigationFixture } from './navigation-fixture';

for (const width of [320, 768, 1440]) {
  test(`Password recovery and reset at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/v1/auth/refresh', r => r.fulfill({ status: 401, json: {} }));
    await page.route('**/api/v1/auth/forgot-password', r => r.fulfill({ status: 202, json: { message: 'If eligible, instructions will be queued.' } }));
    let body: any;
    await page.route('**/api/v1/auth/reset-password', r => { body = r.request().postDataJSON(); return r.fulfill({ json: { message: 'Password changed. Sign in again on each device.' } }); });
    await page.goto('/login'); await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill('owner@example.test'); await page.getByRole('button', { name: 'Request reset instructions' }).click();
    await expect(page.getByRole('status')).toContainText('queued');
    await page.goto('/reset-password#email=owner%40example.test&token=synthetic-token');
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible(); await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel('New password', { exact: true }).fill('new-password'); await page.getByLabel('Confirm new password').fill('new-password');
    await page.getByRole('button', { name: 'Change password' }).click(); await expect(page.getByRole('status')).toContainText('Password changed');
    expect(body).toEqual({ email: 'owner@example.test', token: 'synthetic-token', newPassword: 'new-password' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  });
  test(`Voice and invoice image review at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await navigationFixture(page, 'Owner');
    await page.route('**/api/v1/ai/media/capabilities', r => r.fulfill({ json: { ocr: true, voice: true, maxBytes: 5242880 } }));
    const calls: string[] = [];
    await page.route('**/api/v1/ai/media/voice', r => { calls.push('voice'); expect(r.request().postDataJSON().confirmExternalProcessing).toBe(true); return r.fulfill({ json: { text: 'Buy 10 kg rice' } }); });
    await page.route('**/api/v1/ai/media/ocr', r => { calls.push('ocr'); return r.fulfill({ json: { text: 'Rice 10 kg @ 50' } }); });
    await page.goto('/purchases/new'); await page.getByText('Transcribe a voice recording', { exact: true }).click();
    await page.getByLabel('Voice recording').setInputFiles({ name: 'synthetic.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF0000WAVEsynthetic') });
    await expect(page.getByRole('button', { name: 'Transcribe recording' })).toBeDisabled();
    await page.getByRole('checkbox', { name: /I approve sending/ }).check(); await page.getByRole('button', { name: 'Transcribe recording' }).click();
    await page.getByLabel('Review extracted text').fill('Buy 12 kg rice'); await page.getByRole('button', { name: 'Use reviewed text' }).click();
    await expect(page.getByLabel('Enter purchase request')).toHaveValue('Buy 12 kg rice');
    await page.getByText('Transcribe a voice recording', { exact: true }).click();
    await page.getByText('Extract pasted invoice text', { exact: true }).click(); await page.getByText('Read an invoice image', { exact: true }).click();
    await page.getByLabel('Invoice image', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from('synthetic browser transport fixture') });
    await page.getByRole('checkbox', { name: /I approve sending/ }).check(); await page.getByRole('button', { name: 'Read image', exact: true }).click();
    await expect(page.getByLabel('Review extracted text')).toHaveValue('Rice 10 kg @ 50'); await page.getByRole('button', { name: 'Use reviewed text' }).click();
    await expect(page.getByRole('textbox', { name: 'Invoice text', exact: true })).toHaveValue('Rice 10 kg @ 50'); expect(calls).toEqual(['voice', 'ocr']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  });
}
