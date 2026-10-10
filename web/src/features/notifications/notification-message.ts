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

  const earned = notification.earnedCents === null ? null : formatCents(notification.earnedCents);

  if (notification.kind === 'bidder_auction_won') {
    return {
      label: 'You won',
      headline: price === null ? `You won ${title}` : `You won ${title} for ${price}`,
      detail: 'Your maximum bid was the highest. Pay now to complete your purchase.',
      isPositive: true,
    };
  }
  if (notification.kind === 'seller_purchase_paid') {
    return {
      label: 'Paid',
      headline: `${title}: payment received`,
      detail:
        earned === null
          ? 'The buyer has paid and the work now belongs to them.'
          : `The buyer paid${price === null ? '' : ` ${price}`}. ${earned} has been added to your earnings.`,
      isPositive: true,
    };
  }
  if (notification.kind === 'artist_royalty_earned') {
    return {
      label: 'Royalty',
      headline: earned === null ? `You earned a royalty on ${title}` : `You earned a ${earned} royalty`,
      detail: `${title} was resold${price === null ? '' : ` for ${price}`}. Your resale royalty is in your earnings.`,
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
