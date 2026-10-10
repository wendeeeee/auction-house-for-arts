import { ReserveStatus } from '../auctions.types';

/**
 * What the public may know about the hidden reserve: whether there is one, and whether the
 * leading maximum has reached it. Never the amount.
 */
export function decideReserveStatus(reservePriceCents: number | null, leaderMaxCents: number | null): ReserveStatus {
  if (reservePriceCents === null) return 'none';
  return leaderMaxCents !== null && leaderMaxCents >= reservePriceCents ? 'met' : 'not_met';
}

/**
 * The same answer from the stored auction row, which keeps the price but not the leader's
 * maximum. Equivalent because `resolveProxyBids` lifts the price to the reserve as soon as the
 * leading maximum reaches it, and never sets the price above the leading maximum. So, with a
 * leader, `price >= reserve` exactly when `leaderMax >= reserve`. The spec checks this.
 */
export function decideReserveStatusOfAuction(auction: {
  readonly reservePriceCents: number | null;
  readonly leaderUserId: string | null;
  readonly currentPriceCents: number;
}): ReserveStatus {
  return decideReserveStatus(auction.reservePriceCents, auction.leaderUserId === null ? null : auction.currentPriceCents);
}
