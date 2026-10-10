import type { PurchasePaidPayload } from '../outbox';
import { PaidNotificationRecipient } from './notifications.types';

/** The seller always; on a resale, the artist too, unless their royalty rounded to nothing. */
export function decidePurchasePaidRecipients(event: PurchasePaidPayload): PaidNotificationRecipient[] {
  const recipients: PaidNotificationRecipient[] = [
    { recipientUserId: event.sellerUserId, kind: 'seller_purchase_paid', earnedCents: event.sellerProceedsCents },
  ];
  if (event.saleType === 'resale' && event.artistRoyaltyCents > 0) {
    recipients.push({ recipientUserId: event.artistUserId, kind: 'artist_royalty_earned', earnedCents: event.artistRoyaltyCents });
  }
  return recipients;
}
