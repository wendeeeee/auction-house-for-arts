import type { AuctionClosedPayload } from '../outbox';
import { NotificationRecipient } from './notifications.types';

/** The seller always; the winner of a sale; the highest bidder when the reserve was not met. */
export function decideNotificationRecipients(event: AuctionClosedPayload): NotificationRecipient[] {
  const recipients: NotificationRecipient[] = [{ recipientUserId: event.sellerUserId, kind: 'seller_auction_closed' }];
  if (event.outcome === 'sold' && event.winningUserId !== null) {
    recipients.push({ recipientUserId: event.winningUserId, kind: 'bidder_auction_won' });
  }
  if (event.outcome === 'reserve_not_met' && event.leadingBidderUserId !== null) {
    recipients.push({ recipientUserId: event.leadingBidderUserId, kind: 'bidder_reserve_not_met' });
  }
  return recipients;
}
