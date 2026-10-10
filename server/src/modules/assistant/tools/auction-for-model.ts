import { z } from 'zod';
import { ARTWORK_MEDIUMS } from '../../artworks';
import { AUCTION_STATUSES, AuctionSummaryView, RESERVE_STATUSES } from '../../auctions';
import { toSellerText } from '../seller-text';

/** The public face of an auction, as the model sees it. Strict: nothing beyond these fields can pass. */
export const auctionForModelSchema = z.strictObject({
  auctionSlug: z.string(),
  artworkSlug: z.string(),
  title: z.string(),
  artistName: z.string(),
  medium: z.enum(ARTWORK_MEDIUMS),
  year: z.number().int().nullable(),
  dimensions: z.string(),
  status: z.enum(AUCTION_STATUSES),
  priceCents: z.number().int(),
  bidCount: z.number().int(),
  reserveStatus: z.enum(RESERVE_STATUSES),
  endsAt: z.string(),
  timeLeft: z.string(),
  extensionCount: z.number().int(),
});
export type AuctionForModel = z.infer<typeof auctionForModelSchema>;

/** Built from the public summary view, which already never carries the reserve or anyone's maximum. */
export function toAuctionForModel(summary: AuctionSummaryView, now: Date): AuctionForModel {
  return {
    auctionSlug: summary.slug,
    artworkSlug: summary.artwork.slug,
    title: toSellerText(summary.artwork.title, 200),
    artistName: toSellerText(summary.artwork.artist.name, 120),
    medium: summary.artwork.medium,
    year: summary.artwork.year,
    dimensions: toSellerText(summary.artwork.dimensions, 120),
    status: summary.status,
    priceCents: summary.priceCents,
    bidCount: summary.bidCount,
    reserveStatus: summary.reserveStatus,
    endsAt: summary.endsAt,
    timeLeft: summary.status === 'ended' ? 'ended' : describeTimeLeft(new Date(summary.endsAt), now),
    extensionCount: summary.extensionCount,
  };
}

export function describeTimeLeft(endsAt: Date, now: Date): string {
  const minutes = Math.floor((endsAt.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return 'ended';
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
