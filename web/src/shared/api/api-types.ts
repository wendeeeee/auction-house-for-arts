/** Response shapes, mirroring the server's `*.view.ts` zod schemas (see /api/docs). */

export const ARTWORK_MEDIUMS = ['Painting', 'Print', 'Photography', 'Sculpture', 'Drawing', 'Digital'] as const;
export type ArtworkMedium = (typeof ARTWORK_MEDIUMS)[number];

export interface UserView {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
}

export interface ArtistView {
  readonly slug: string;
  readonly name: string;
  readonly bio: string;
  readonly royaltyBps: number;
}

export interface ArtworkSummaryView {
  readonly slug: string;
  readonly title: string;
  readonly year: number | null;
  readonly medium: ArtworkMedium;
  readonly dimensions: string;
  readonly artist: { readonly slug: string; readonly name: string };
  readonly saleType: 'primary' | 'resale';
}

export interface ArtworkDetailView extends Omit<ArtworkSummaryView, 'artist'> {
  readonly description: string;
  readonly ownerUserId: string;
  readonly artist: ArtistView;
}

export interface ListView<T> {
  readonly items: readonly T[];
}

export const AUCTION_STATUS_FILTERS = ['open', 'ended', 'all'] as const;
export type AuctionStatusFilter = (typeof AUCTION_STATUS_FILTERS)[number];

export const AUCTION_LIST_SORTS = ['ending_soon', 'price_low', 'price_high', 'most_bids'] as const;
export type AuctionListSort = (typeof AUCTION_LIST_SORTS)[number];

/** Whether a hidden reserve exists and is met. The API never sends the reserve amount. */
export type ReserveStatus = 'none' | 'not_met' | 'met';

export interface AuctionSummaryView {
  readonly slug: string;
  readonly artwork: ArtworkSummaryView;
  readonly status: 'open' | 'ended';
  readonly startingPriceCents: number;
  readonly priceCents: number;
  readonly bidCount: number;
  readonly reserveStatus: ReserveStatus;
  /** ISO 8601. Moves later with each soft-close extension. */
  readonly endsAt: string;
  readonly extensionCount: number;
}

export interface BidHistoryEntryView {
  readonly bidderHandle: string;
  readonly amountCents: number;
  readonly kind: 'placed' | 'automatic';
  readonly createdAt: string;
}

export interface AuctionDetailView extends AuctionSummaryView {
  readonly sellerHandle: string;
  readonly leaderHandle: string | null;
  /** For anyone but the leader; the leader may raise to anything above their own maximum. */
  readonly minimumNextBidCents: number;
  readonly originalEndsAt: string;
  /** Newest first. */
  readonly history: readonly BidHistoryEntryView[];
  readonly yourMaxBidCents: number | null;
  readonly youAreLeading: boolean;
  readonly youMayBid: boolean;
}

export interface PlaceMaximumBidResultView {
  readonly leading: boolean;
  readonly priceCents: number;
  readonly minimumNextBidCents: number;
  readonly endsAt: string;
  readonly extended: boolean;
}
