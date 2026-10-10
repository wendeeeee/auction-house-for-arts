import { apiClient } from '../../shared/api/api-client';
import type { NotificationListView, NotificationView } from '../../shared/api/api-types';

export function listNotifications(signal: AbortSignal): Promise<NotificationListView> {
  return apiClient.get('/notifications', { signal });
}

export function markNotificationRead(notificationId: string): Promise<NotificationView> {
  return apiClient.post(`/notifications/${encodeURIComponent(notificationId)}/read`, {});
}
