import { ApiError } from '../../shared/api/api-error';
import type { PlaceMaximumBidResultView } from '../../shared/api/api-types';
import { formatCents } from '../../shared/format/money';

export interface BidMessage {
  readonly tone: 'success' | 'warning' | 'error';
  readonly title: string;
  readonly detail: string;
}

/**
 * What an accepted bid means for the bidder. Being outbid at once is not an error: the bid
 * counts and raises the price, it just did not take the lead.
 */
export function describeBidOutcome(result: PlaceMaximumBidResultView): BidMessage {
  const extension = result.extended ? ' Your bid came near the end, so the auction was extended.' : '';
  if (result.leading) {
    return {
      tone: 'success',
      title: `You’re the highest bidder at ${formatCents(result.priceCents)}.`,
      detail: `We’ll bid for you only as much as needed, up to your maximum.${extension}`,
    };
  }
  return {
    tone: 'warning',
    title: 'You were outbid straight away by an earlier maximum.',
    detail: `Your bid raised the price to ${formatCents(result.priceCents)}. Bid ${formatCents(
      result.minimumNextBidCents,
    )} or more to try again.${extension}`,
  };
}

/** A rejected bid, in words, using the error code and its details rather than the server's message. */
export function describeBidRejection(error: unknown): BidMessage {
  if (!(error instanceof ApiError)) {
    return { tone: 'error', title: 'Your bid was not placed.', detail: 'Something went wrong. Please try again.' };
  }
  const details = error.details;
  switch (error.code) {
    case 'BID_TOO_LOW':
      return {
        tone: 'error',
        title: 'That maximum is too low.',
        detail:
          typeof details.minimumNextBidCents === 'number'
            ? `Enter ${formatCents(details.minimumNextBidCents)} or more.`
            : 'Enter at least the minimum bid shown.',
      };
    case 'MAX_NOT_RAISED':
      return {
        tone: 'error',
        title: 'You’re already leading.',
        detail:
          typeof details.yourMaxBidCents === 'number'
            ? `To raise your maximum, enter more than ${formatCents(details.yourMaxBidCents)}.`
            : 'To raise your maximum, enter a higher amount.',
      };
    case 'AUCTION_ENDED':
      return { tone: 'error', title: 'This auction has ended.', detail: 'Bids are no longer accepted.' };
    case 'NOT_ALLOWED_TO_BID':
      return {
        tone: 'error',
        title: 'You can’t bid on this auction.',
        detail: details.reason === 'owner' ? 'You own this artwork.' : 'You are the seller.',
      };
    case 'UNAUTHENTICATED':
      return { tone: 'error', title: 'Choose a demo user to bid.', detail: 'Use “Viewing as” in the header.' };
    default:
      return { tone: 'error', title: 'Your bid was not placed.', detail: error.message };
  }
}
