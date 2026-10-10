import { ProxyBidState, resolveProxyBids } from '../auctions';
import { AuctionOutcome } from './closing.types';

export type AuctionOutcomeDecision =
  | {
      readonly outcome: Extract<AuctionOutcome, 'sold'>;
      readonly winningUserId: string;
      readonly hammerPriceCents: number;
      readonly leadingBidderUserId: string;
    }
  | {
      readonly outcome: Extract<AuctionOutcome, 'reserve_not_met'>;
      readonly winningUserId: null;
      readonly hammerPriceCents: null;
      readonly leadingBidderUserId: string;
    }
  | {
      readonly outcome: Extract<AuctionOutcome, 'no_bids'>;
      readonly winningUserId: null;
      readonly hammerPriceCents: null;
      readonly leadingBidderUserId: null;
    };

/** Sold when the leader's maximum reaches the reserve (or there is none), at the visible price. */
export function decideAuctionOutcome(state: ProxyBidState): AuctionOutcomeDecision {
  const resolution = resolveProxyBids(state);
  if (resolution.leaderUserId === null || resolution.leaderMaxCents === null) {
    return { outcome: 'no_bids', winningUserId: null, hammerPriceCents: null, leadingBidderUserId: null };
  }

  const isReserveMet = state.reservePriceCents === null || resolution.leaderMaxCents >= state.reservePriceCents;
  if (!isReserveMet) {
    return {
      outcome: 'reserve_not_met',
      winningUserId: null,
      hammerPriceCents: null,
      leadingBidderUserId: resolution.leaderUserId,
    };
  }
  return {
    outcome: 'sold',
    winningUserId: resolution.leaderUserId,
    hammerPriceCents: resolution.priceCents,
    leadingBidderUserId: resolution.leaderUserId,
  };
}
