import { test, expect, type WebSocketRoute } from '@playwright/test';
import { navigationFixture } from './navigation-fixture';
// Protocol-level browser fixture, not a claim of live API/production delivery.
test('SignalR purchase and notification frames refresh the mobile client once and reconnect refreshes missed data', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); await navigationFixture(page, 'Owner');
  let unread = 1, unreadReads = 0, purchaseReads = 0;
  const sockets: WebSocketRoute[] = [];
  await page.route('**/api/v1/realtime/negotiate?*', route => route.fulfill({ json: { negotiateVersion: 1, connectionId: 'browser-fixture', connectionToken: 'browser-fixture', availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text'] }] } }));
  await page.route('**/api/v1/notifications/unread-count', route => { unreadReads++; return route.fulfill({ json: { count: unread } }); });
  await page.route('**/api/v1/purchases?*', route => { purchaseReads++; return route.fulfill({ json: { data: [], totalCount: 0, totalPages: 0 } }); });
  await page.routeWebSocket(/\/api\/v1\/realtime\?/, socket => {
    sockets.push(socket); socket.onMessage(message => {
      if (message.toString().includes('"protocol":"json"')) socket.send('{}\u001e');
    });
  });
  const frame = (id: string, type: string, businessId = 'b1') => JSON.stringify({ type: 1, target: 'businessEvent', arguments: [{ id, type, businessId }] }) + '\u001e';
  await page.goto('/purchases/list'); await expect(page.getByRole('heading', { name: 'Purchase Orders', exact: true })).toBeVisible();
  const bell = page.locator('header').getByRole('button', { name: 'Notifications', exact: true }); await expect(bell).toHaveAccessibleDescription('1 unread notifications');
  await expect.poll(() => sockets.length).toBe(1); const purchaseBaseline = purchaseReads;
  sockets[0].send(frame('purchase-1', 'purchase.changed')); await expect.poll(() => purchaseReads).toBe(purchaseBaseline + 1);
  const unreadBaseline = unreadReads; unread = 2;
  sockets[0].send(frame('notification-1', 'notification.changed')); await expect(bell).toHaveAccessibleDescription('2 unread notifications');
  expect(unreadReads).toBe(unreadBaseline + 1);
  sockets[0].send(frame('purchase-1', 'purchase.changed')); sockets[0].send(frame('foreign-purchase', 'purchase.changed', 'foreign')); sockets[0].send(frame('notification-1', 'notification.changed')); sockets[0].send(frame('foreign-notification', 'notification.changed', 'foreign'));
  // A subsequent legitimate event is a barrier: earlier frames have been processed.
  unread = 3; sockets[0].send(frame('notification-2', 'notification.changed')); await expect(bell).toHaveAccessibleDescription('3 unread notifications');
  expect(unreadReads).toBe(unreadBaseline + 2); expect(purchaseReads).toBe(purchaseBaseline + 1);
  const reconnectPurchaseBaseline = purchaseReads, reconnectUnreadBaseline = unreadReads; unread = 4;
  await sockets[0].close({ code: 1011, reason: 'Synthetic disconnect' }); await expect.poll(() => sockets.length).toBe(2);
  await expect(bell).toHaveAccessibleDescription('4 unread notifications'); await expect.poll(() => purchaseReads).toBe(reconnectPurchaseBaseline + 1); expect(unreadReads).toBe(reconnectUnreadBaseline + 1);
});
for (const role of ['Owner', 'Manager', 'Staff'] as const) test(`bilingual help retains ${role} permitted routes and accurate unavailable features`, async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); await navigationFixture(page, role); await page.goto('/settings/help');
  const stock = page.locator('summary').filter({ hasText: /^Stock$/ }); await stock.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[lang="ar"][dir="rtl"]').getByText('افتح الصنف لمراجعة مخزون النظام والعدد الفعلي.')).toBeVisible();
  await page.getByRole('link', { name: 'Try it · Stock', exact: true }).click(); await expect(page).toHaveURL(/inventory\/all$/);
  await page.goto('/settings/help'); await page.locator('summary').filter({ hasText: /^Barcode lookup$/ }).click();
  await expect(page.getByText('استخدم الكاميرا في المتصفحات المدعومة أو أدخل الرمز يدوياً.')).toBeVisible();
  if (role !== 'Owner') await expect(page.locator('summary').filter({ hasText: /^Add staff$/ })).toHaveCount(0);
});
