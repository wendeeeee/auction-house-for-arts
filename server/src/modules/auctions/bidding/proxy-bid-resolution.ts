import { InvariantViolationError } from '../../../common/errors';
import { BidTooLowError, MaximumNotRaisedError } from '../auctions.errors';
import { MaximumBid } from '../auctions.types';
import { incrementForPriceCents } from './bid-increments';

export interface ProxyBidState {
  readonly startingPriceCents: number;
  readonly reservePriceCents: number | null;
  /** Every bidder's standing maximum, in any order, at most one per bidder. */
  readonly maximumBids: readonly MaximumBid[];
}

export interface ProxyBidResolution {
  readonly leaderUserId: string | null;
  /** Private to the leader and the server. Used for the reserve status, never shown to others. */
  readonly leaderMaxCents: number | null;
  /** The visible price. */
  readonly priceCents: number;
}

/**
 * Derives the visible auction state from everyone's maximums. Pure and order-independent: the
 * same maximums always give the same answer, which is what lets the concurrency test check
 * the stored state against a recomputation.
 *
 * - Leader: the highest maximum; between equal maximums, the one placed first.
 * - Price: the starting price with fewer than two bidders, otherwise
 *   `min(leaderMax, secondMax + increment(secondMax))`: just enough to beat the runner-up,
 *   never more than the leader agreed to pay.
 * - Reserve: once the leader's maximum reaches it, the price is lifted to at least the reserve
 *   (still never above the leader's maximum, which is at least the reserve by then).
 */
export function resolveProxyBids(state: ProxyBidState): ProxyBidResolution {
  const [leader, runnerUp] = rankMaximumBids(state.maximumBids);
  if (!leader) {
    return { leaderUserId: null, leaderMaxCents: null, priceCents: state.startingPriceCents };
  }

  let priceCents = runnerUp
    ? Math.min(leader.maxCents, runnerUp.maxCents + incrementForPriceCents(runnerUp.maxCents))
    : state.startingPriceCents;

  if (state.reservePriceCents !== null && leader.maxCents >= state.reservePriceCents) {
    priceCents = Math.max(priceCents, state.reservePriceCents);
  }

  return { leaderUserId: leader.bidderUserId, leaderMaxCents: leader.maxCents, priceCents };
}

/** Highest maximum first; equal maximums in placement order (the earlier placement wins). */
export function rankMaximumBids(maximumBids: readonly MaximumBid[]): MaximumBid[] {
  const bidderUserIds = new Set(maximumBids.map((bid) => bid.bidderUserId));
  if (bidderUserIds.size !== maximumBids.length) {
    // The (auction_id, bidder_user_id) primary key makes this impossible.
    throw new InvariantViolationError('A bidder has more than one maximum bid on an auction.');
  }
  return [...maximumBids].sort(
    (first, second) => second.maxCents - first.maxCents || first.placementSequence - second.placementSequence,
  );
}

/**
 * The lowest maximum a bidder other than the leader may place: the starting price when there
 * are no bids, otherwise one increment above the visible price.
 */
export function computeMinimumNextBidCents(
  state: Pick<ProxyBidState, 'startingPriceCents'>,
  resolution: Pick<ProxyBidResolution, 'leaderUserId' | 'priceCents'>,
): number {
  if (resolution.leaderUserId === null) return state.startingPriceCents;
  return resolution.priceCents + incrementForPriceCents(resolution.priceCents);
}

/**
 * Throws if this maximum may not be placed now.
 * - The leader may raise to any amount above their current maximum (`MAX_NOT_RAISED` otherwise).
 *   They are not held to the minimum next bid: they are not bidding against the price.
 * - Everyone else, including a previously outbid bidder raising their own maximum, must reach
 *   the minimum next bid (`BID_TOO_LOW` otherwise).
 */
export function assertMaximumBidIsAcceptable(
  state: ProxyBidState,
  resolution: ProxyBidResolution,
  bid: { readonly bidderUserId: string; readonly maxBidCents: number },
): void {
  if (resolution.leaderUserId === bid.bidderUserId) {
    const yourMaxBidCents = resolution.leaderMaxCents ?? 0;
    if (bid.maxBidCents <= yourMaxBidCents) {
      throw new MaximumNotRaisedError({ maxBidCents: bid.maxBidCents, yourMaxBidCents });
    }
    return;
  }

  const minimumNextBidCents = computeMinimumNextBidCents(state, resolution);
  if (bid.maxBidCents < minimumNextBidCents) {
    throw new BidTooLowError({ maxBidCents: bid.maxBidCents, minimumNextBidCents });
  }
}

/** The maximums after `newBid` replaces the bidder's previous one (or joins, for a first bid). */
export function replaceMaximumBid(maximumBids: readonly MaximumBid[], newBid: MaximumBid): MaximumBid[] {
  return [...maximumBids.filter((bid) => bid.bidderUserId !== newBid.bidderUserId), newBid];
}
