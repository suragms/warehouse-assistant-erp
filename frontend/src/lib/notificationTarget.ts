import type { NotificationDto } from '../api/notificationApi';
export function notificationTarget(notification: NotificationDto): string | undefined {
  if (!notification.referenceId) return undefined;
  const id = encodeURIComponent(notification.referenceId);
  switch (notification.referenceType) {
    case 'Purchase': case 'PurchaseOrder': return `/purchases/${id}`;
    case 'CatalogItem': return `/inventory/${id}`;
    case 'MlPrediction': return `/ml?itemId=${id}`;
    case 'Membership': return '/users';
    case 'DamageReport': return '/purchases/list';
    default: return undefined;
  }
}
