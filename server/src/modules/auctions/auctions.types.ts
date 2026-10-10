export interface Auction {
  readonly id: string;
  readonly slug: string;
  readonly artworkId: string;
  readonly sellerUserId: string;
  readonly startingPriceCents: number;
  /** Hidden. Never leaves the server; only `reserveStatus` does. */
  readonly reservePriceCents: number | null;
  readonly endsAt: Date;
  readonly originalEndsAt: Date;
  readonly extensionCount: number;
  /** Denormalized from `max_bids` by `resolveProxyBids`, written under the auction row lock. */
  readonly currentPriceCents: number;
  readonly leaderUserId: string | null;
  /** The number of visible history rows. */
  readonly bidCount: number;
  /** Set by the close worker (phase 4). Until then an auction past `ends_at` is ended but not closed. */
  readonly closedAt: Date | null;
  readonly createdAt: Date;
}

/** One bidder's standing maximum on one auction. At most one per bidder: a raise replaces it. */
export interface MaximumBid {
  readonly bidderUserId: string;
  readonly maxCents: number;
  /**
   * Orders placements: a higher number was placed later. Breaks ties between equal maximums
   * (the earlier one wins). A raise takes a new number, because the raised amount was committed
   * to at the time of the raise.
   */
  readonly placementSequence: number;
}

export const BID_HISTORY_KINDS = ['placed', 'automatic'] as const;
/** `placed`: the bidder's own submission. `automatic`: the system bidding for a leader from their maximum. */
export type BidHistoryKind = (typeof BID_HISTORY_KINDS)[number];

export interface BidHistoryEntry {
  readonly id: number;
  readonly auctionId: string;
  readonly bidderUserId: string;
  readonly amountCents: number;
  readonly kind: BidHistoryKind;
  readonly createdAt: Date;
}

export const RESERVE_STATUSES = ['none', 'not_met', 'met'] as const;
export type ReserveStatus = (typeof RESERVE_STATUSES)[number];

export const AUCTION_STATUSES = ['open', 'ended'] as const;
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

export const AUCTION_STATUS_FILTERS = ['open', 'ended', 'all'] as const;
export type AuctionStatusFilter = (typeof AUCTION_STATUS_FILTERS)[number];

export const AUCTION_LIST_SORTS = ['ending_soon', 'price_low', 'price_high', 'most_bids'] as const;
export type AuctionListSort = (typeof AUCTION_LIST_SORTS)[number];
