import { BidHistoryKind } from '../auctions.types';
import { ProxyBidResolution } from './proxy-bid-resolution';

export interface PlannedHistoryEntry {
  readonly bidderUserId: string;
  readonly amountCents: number;
  readonly kind: BidHistoryKind;
}

export interface AcceptedBid {
  readonly bidderUserId: string;
  readonly maxBidCents: number;
}

/** What the soft close and the history both key on: did anything the public can see change? */
export function hasPriceOrLeaderChanged(before: ProxyBidResolution, after: ProxyBidResolution): boolean {
  return before.priceCents !== after.priceCents || before.leaderUserId !== after.leaderUserId;
}

/**
 * The visible history rows an accepted bid produces, in order. Only changes to the price or
 * the leader are recorded:
 *
 * - Nothing visible changed (a leader raising their own maximum): no row. A row would show a
 *   bid at an unchanged price and hint that the leader raised.
 * - The bidder now leads (a first bid, taking the lead, or a self-raise that meets the
 *   reserve): one `placed` row at the new price.
 * - The bidder was outbid at once by an existing maximum: a `placed` row at the bidder's
 *   maximum (which the new price reveals anyway), then an `automatic` row for the leader at the
 *   new price, so the record shows why the price moved.
 *
 * Invariants the concurrency test checks: amounts never decrease, and the last row is always
 * (leader, price).
 */
export function decideBidHistoryEntries(
  before: ProxyBidResolution,
  after: ProxyBidResolution,
  bid: AcceptedBid,
): PlannedHistoryEntry[] {
  if (!hasPriceOrLeaderChanged(before, after) || after.leaderUserId === null) return [];

  if (after.leaderUserId === bid.bidderUserId) {
    return [{ bidderUserId: bid.bidderUserId, amountCents: after.priceCents, kind: 'placed' }];
  }

  return [
    { bidderUserId: bid.bidderUserId, amountCents: bid.maxBidCents, kind: 'placed' },
    { bidderUserId: after.leaderUserId, amountCents: after.priceCents, kind: 'automatic' },
  ];
}
