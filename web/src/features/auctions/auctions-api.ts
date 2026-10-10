import { apiClient } from '../../shared/api/api-client';
import type {
  ArtworkMedium,
  AuctionDetailView,
  AuctionListSort,
  AuctionOutcomeView,
  AuctionStatusFilter,
  AuctionSummaryView,
  ListView,
  PlaceMaximumBidResultView,
} from '../../shared/api/api-types';

export interface AuctionListFilters {
  readonly status?: AuctionStatusFilter;
  readonly medium?: ArtworkMedium;
  /** An artwork slug: that artwork's auctions only. */
  readonly artwork?: string;
  readonly sort?: AuctionListSort;
}

export interface CreateAuctionRequest {
  readonly artworkSlug: string;
  readonly startingPriceCents: number;
  readonly reservePriceCents?: number;
  readonly endsAt: string;
}

export function listAuctions(filters: AuctionListFilters, signal: AbortSignal): Promise<ListView<AuctionSummaryView>> {
  return apiClient.get('/auctions', { query: { ...filters }, signal });
}

/** The detail depends on who is asking (your maximum, whether you may bid). */
export function getAuction(slug: string, signal: AbortSignal): Promise<AuctionDetailView> {
  return apiClient.get(`/auctions/${encodeURIComponent(slug)}`, { signal });
}

export function getAuctionOutcome(slug: string, signal: AbortSignal): Promise<AuctionOutcomeView> {
  return apiClient.get(`/auctions/${encodeURIComponent(slug)}/outcome`, { signal });
}

export function placeMaximumBid(slug: string, maxBidCents: number): Promise<PlaceMaximumBidResultView> {
  return apiClient.post(`/auctions/${encodeURIComponent(slug)}/bids`, { maxBidCents });
}

export function createAuction(request: CreateAuctionRequest): Promise<AuctionDetailView> {
  return apiClient.post('/auctions', request);
}
