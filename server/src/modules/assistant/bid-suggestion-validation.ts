import type { AuctionDetailView } from '../auctions';

export type BidSuggestionRejection =
  | 'unseen_auction'
  | 'auction_not_found'
  | 'auction_ended'
  | 'not_allowed_to_bid'
  | 'not_above_your_maximum'
  | 'below_minimum';

/**
 * Why a suggested maximum must not be shown, or null if it may. Mirrors the bid endpoint's
 * rules (`assertMaximumBidIsAcceptable`): the leader raises above their own maximum; anyone else
 * must reach the minimum next bid. The suggestion still only pre-fills the form, and the bid
 * endpoint checks again under its lock.
 */
export function decideBidSuggestionRejection(input: {
  readonly wasSeenInSession: boolean;
  /** Read live for the current user; null when the slug is not an auction. */
  readonly auction: Pick<AuctionDetailView, 'status' | 'youMayBid' | 'youAreLeading' | 'yourMaxBidCents' | 'minimumNextBidCents'> | null;
  readonly amountCents: number;
}): BidSuggestionRejection | null {
  const { auction, amountCents } = input;
  if (!input.wasSeenInSession) return 'unseen_auction';
  if (auction === null) return 'auction_not_found';
  if (auction.status === 'ended') return 'auction_ended';
  if (!auction.youMayBid) return 'not_allowed_to_bid';
  if (auction.youAreLeading) {
    return amountCents > (auction.yourMaxBidCents ?? 0) ? null : 'not_above_your_maximum';
  }
  return amountCents >= auction.minimumNextBidCents ? null : 'below_minimum';
}
