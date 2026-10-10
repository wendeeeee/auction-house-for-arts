import { z } from 'zod';
import { InvariantViolationError } from '../../common/errors';
import { artworkSummaryViewSchema, toArtworkSummaryView } from '../artworks';
import type { AuctionDetails, AuctionListing } from './auction.service';
import { AUCTION_STATUSES, BID_HISTORY_KINDS, RESERVE_STATUSES } from './auctions.types';
import { decideAuctionStatus } from './bidding/auction-status';
import { decideBidderIneligibility } from './bidding/bidder-eligibility';
import { computeMinimumNextBidCents } from './bidding/proxy-bid-resolution';
import { decideReserveStatusOfAuction } from './bidding/reserve-status';

/*
 * Every response is built field by field from these schemas, never by spreading a domain
 * object, so the reserve amount and other bidders' maximums cannot leak in by accident.
 */

export const auctionSummaryViewSchema = z.object({
  slug: z.string(),
  artwork: artworkSummaryViewSchema,
  status: z.enum(AUCTION_STATUSES),
  startingPriceCents: z.number().int(),
  priceCents: z.number().int().describe('The visible price, derived from everyone’s maximums.'),
  bidCount: z.number().int().describe('Visible bid history rows.'),
  reserveStatus: z.enum(RESERVE_STATUSES).describe('Whether a hidden reserve exists and is met. Never its amount.'),
  endsAt: z.iso.datetime(),
  extensionCount: z.number().int().describe('Soft-close extensions so far.'),
});
export type AuctionSummaryView = z.infer<typeof auctionSummaryViewSchema>;

export const auctionListViewSchema = z.object({ items: z.array(auctionSummaryViewSchema) });
export type AuctionListView = z.infer<typeof auctionListViewSchema>;

export const bidHistoryEntryViewSchema = z.object({
  bidderHandle: z.string(),
  amountCents: z.number().int(),
  kind: z.enum(BID_HISTORY_KINDS).describe('placed: the bidder’s own bid. automatic: bid by the system from a maximum.'),
  createdAt: z.iso.datetime(),
});

export const auctionDetailViewSchema = auctionSummaryViewSchema.extend({
  sellerHandle: z.string(),
  leaderHandle: z.string().nullable(),
  minimumNextBidCents: z
    .number()
    .int()
    .describe('The lowest maximum anyone but the leader may place. The leader may raise to anything above their maximum.'),
  originalEndsAt: z.iso.datetime(),
  history: z.array(bidHistoryEntryViewSchema).describe('Newest first.'),
  yourMaxBidCents: z.number().int().nullable().describe('Your own maximum on this auction, if you have bid.'),
  youAreLeading: z.boolean(),
  youMayBid: z.boolean().describe('False when anonymous, when the auction has ended, or for the seller and the owner.'),
});
export type AuctionDetailView = z.infer<typeof auctionDetailViewSchema>;

export const placeMaximumBidResultViewSchema = z.object({
  leading: z.boolean().describe('False when an existing maximum outbid you at once; the bid still counts.'),
  priceCents: z.number().int(),
  minimumNextBidCents: z.number().int(),
  endsAt: z.iso.datetime(),
  extended: z.boolean().describe('True when this bid triggered the soft close and pushed the end out.'),
});
export type PlaceMaximumBidResultView = z.infer<typeof placeMaximumBidResultViewSchema>;

export function toAuctionSummaryView({ auction, artwork }: AuctionListing, now: Date): AuctionSummaryView {
  return {
    slug: auction.slug,
    artwork: toArtworkSummaryView(artwork),
    status: decideAuctionStatus(auction, now),
    startingPriceCents: auction.startingPriceCents,
    priceCents: auction.currentPriceCents,
    bidCount: auction.bidCount,
    reserveStatus: decideReserveStatusOfAuction(auction),
    endsAt: auction.endsAt.toISOString(),
    extensionCount: auction.extensionCount,
  };
}

export function toAuctionDetailView(details: AuctionDetails, now: Date): AuctionDetailView {
  const { auction, artwork, history, handlesByUserId, viewer } = details;
  const handleOf = (userId: string): string => {
    const handle = handlesByUserId.get(userId);
    // Foreign keys make this impossible; fail loudly rather than show a blank bidder.
    if (handle === undefined) throw new InvariantViolationError('An auction references an unknown user.', { userId });
    return handle;
  };
  const summary = toAuctionSummaryView(details, now);
  const isViewerLeading = viewer !== null && auction.leaderUserId === viewer.userId;

  return {
    ...summary,
    sellerHandle: handleOf(auction.sellerUserId),
    leaderHandle: auction.leaderUserId === null ? null : handleOf(auction.leaderUserId),
    minimumNextBidCents: computeMinimumNextBidCents(auction, {
      leaderUserId: auction.leaderUserId,
      priceCents: auction.currentPriceCents,
    }),
    originalEndsAt: auction.originalEndsAt.toISOString(),
    history: history.map((entry) => ({
      bidderHandle: handleOf(entry.bidderUserId),
      amountCents: entry.amountCents,
      kind: entry.kind,
      createdAt: entry.createdAt.toISOString(),
    })),
    yourMaxBidCents: viewer?.maximumBid?.maxCents ?? null,
    youAreLeading: isViewerLeading,
    youMayBid:
      viewer !== null &&
      summary.status === 'open' &&
      decideBidderIneligibility({
        bidderUserId: viewer.userId,
        sellerUserId: auction.sellerUserId,
        ownerUserId: artwork.artwork.ownerUserId,
      }) === null,
  };
}
