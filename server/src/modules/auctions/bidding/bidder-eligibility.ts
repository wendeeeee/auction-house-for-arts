import { BidderIneligibilityReason, BidderNotEligibleError } from '../auctions.errors';

export interface BidderEligibilityInput {
  readonly bidderUserId: string;
  readonly sellerUserId: string;
  /** The artwork's owner now, read at bid time. */
  readonly ownerUserId: string;
}

/**
 * Why this user may not bid, or null if they may. The seller and the owner would be bidding up
 * their own sale (shill bidding). The artist is not excluded: they may bid on someone else's
 * resale of their work.
 */
export function decideBidderIneligibility(input: BidderEligibilityInput): BidderIneligibilityReason | null {
  if (input.bidderUserId === input.sellerUserId) return 'seller';
  if (input.bidderUserId === input.ownerUserId) return 'owner';
  return null;
}

export function assertBidderIsEligible(input: BidderEligibilityInput): void {
  const reason = decideBidderIneligibility(input);
  if (reason !== null) throw new BidderNotEligibleError(reason);
}
