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

export type AuctionOutcome = 'sold' | 'reserve_not_met' | 'no_bids';

export type AuctionOutcomeView =
  | { readonly isClosed: false }
  | {
      readonly isClosed: true;
      readonly outcome: AuctionOutcome;
      readonly hammerPriceCents: number | null;
      readonly winnerHandle: string | null;
      readonly closedAt: string;
      readonly youWon: boolean;
    };

export type NotificationKind =
  | 'seller_auction_closed'
  | 'bidder_auction_won'
  | 'bidder_reserve_not_met'
  | 'seller_purchase_paid'
  | 'artist_royalty_earned';

export interface NotificationView {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly auctionSlug: string;
  readonly artworkTitle: string;
  readonly outcome: AuctionOutcome;
  readonly hammerPriceCents: number | null;
  /** Set on payment notifications: the recipient's proceeds or royalty. */
  readonly earnedCents: number | null;
  readonly createdAt: string;
  readonly readAt: string | null;
}

export interface NotificationListView {
  readonly items: readonly NotificationView[];
  readonly unreadCount: number;
}

export interface StartedCheckoutView {
  readonly purchaseId: string;
  readonly amountCents: number;
  readonly currency: 'usd';
  readonly checkoutUrl: string;
}

export type PaymentStatus = 'awaiting_payment' | 'paid';

export type CheckoutStatusView =
  | {
      readonly role: 'buyer';
      readonly status: PaymentStatus;
      readonly purchaseId: string | null;
      readonly amountCents: number;
      readonly currency: 'usd';
      readonly paidAt: string | null;
    }
  | { readonly role: 'seller'; readonly status: PaymentStatus };

export interface EarningsEntryView {
  readonly purchaseId: string;
  readonly accountKind: 'seller_payable' | 'artist_payable';
  readonly earnedCents: number;
  readonly memo: string;
  readonly postedAt: string;
}

export interface EarningsView {
  readonly currency: 'usd';
  readonly sellerProceedsCents: number;
  readonly artistRoyaltiesCents: number;
  readonly recentEntries: readonly EarningsEntryView[];
}
