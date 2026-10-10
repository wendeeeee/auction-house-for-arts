import type { NotificationView } from '../../shared/api/api-types';
import { formatCents } from '../../shared/format/money';

export interface NotificationMessage {
  readonly label: string;
  readonly headline: string;
  readonly detail: string;
  readonly isPositive: boolean;
}

export function describeNotification(notification: NotificationView): NotificationMessage {
  const { artworkTitle: title, outcome, hammerPriceCents } = notification;
  const price = hammerPriceCents === null ? null : formatCents(hammerPriceCents);

  if (notification.kind === 'bidder_auction_won') {
    return {
      label: 'You won',
      headline: price === null ? `You won ${title}` : `You won ${title} for ${price}`,
      detail: 'Your maximum bid was the highest. Payment opens from the auction page.',
      isPositive: true,
    };
  }
  if (notification.kind === 'bidder_reserve_not_met') {
    return {
      label: 'Reserve not met',
      headline: `${title} did not sell`,
      detail: 'You were the highest bidder, but the seller’s reserve price was not reached.',
      isPositive: false,
    };
  }
  if (outcome === 'sold') {
    return {
      label: 'Sold',
      headline: price === null ? `${title} sold` : `${title} sold for ${price}`,
      detail: 'The winning bidder has been told and will pay through checkout.',
      isPositive: true,
    };
  }
  if (outcome === 'reserve_not_met') {
    return {
      label: 'Reserve not met',
      headline: `${title} closed below your reserve`,
      detail: 'It did not sell. You can put it up for auction again.',
      isPositive: false,
    };
  }
  return {
    label: 'No bids',
    headline: `${title} closed without bids`,
    detail: 'It did not sell. You can put it up for auction again.',
    isPositive: false,
  };
}
