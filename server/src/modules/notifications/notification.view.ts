import { z } from 'zod';
import { AUCTION_OUTCOMES } from '../outbox';
import { NOTIFICATION_KINDS, Notification } from './notifications.types';

export const notificationViewSchema = z.object({
  id: z.uuid(),
  kind: z.enum(NOTIFICATION_KINDS),
  auctionSlug: z.string(),
  artworkTitle: z.string(),
  outcome: z.enum(AUCTION_OUTCOMES),
  hammerPriceCents: z.number().int().nullable().describe('The sale price; set only when the auction sold.'),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export type NotificationView = z.infer<typeof notificationViewSchema>;

export const notificationListViewSchema = z.object({
  items: z.array(notificationViewSchema).describe('Newest first.'),
  unreadCount: z.number().int().describe('All unread notifications, including any beyond this page.'),
});
export type NotificationListView = z.infer<typeof notificationListViewSchema>;

export function toNotificationView(notification: Notification): NotificationView {
  return {
    id: notification.id,
    kind: notification.kind,
    auctionSlug: notification.payload.auctionSlug,
    artworkTitle: notification.payload.artworkTitle,
    outcome: notification.payload.outcome,
    hammerPriceCents: notification.payload.hammerPriceCents,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt === null ? null : notification.readAt.toISOString(),
  };
}
