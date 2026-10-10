import { z } from 'zod';
import { AUCTION_OUTCOMES } from '../outbox';

export const NOTIFICATION_KINDS = ['seller_auction_closed', 'bidder_auction_won', 'bidder_reserve_not_met'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const auctionOutcomeNotificationPayloadSchema = z.object({
  auctionSlug: z.string(),
  artworkTitle: z.string(),
  outcome: z.enum(AUCTION_OUTCOMES),
  hammerPriceCents: z.number().int().nullable(),
});
export type AuctionOutcomeNotificationPayload = z.infer<typeof auctionOutcomeNotificationPayloadSchema>;

export interface NotificationRecipient {
  readonly recipientUserId: string;
  readonly kind: NotificationKind;
}

export interface Notification {
  readonly id: string;
  readonly eventId: string;
  readonly recipientUserId: string;
  readonly kind: NotificationKind;
  readonly payload: AuctionOutcomeNotificationPayload;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}
