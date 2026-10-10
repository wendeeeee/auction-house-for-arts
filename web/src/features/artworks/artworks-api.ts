import { apiClient } from '../../shared/api/api-client';
import type { ArtistView, ArtworkDetailView, ArtworkMedium, ArtworkSummaryView, ListView } from '../../shared/api/api-types';

export interface CatalogFilters {
  readonly query?: string;
  readonly medium?: ArtworkMedium;
  readonly artist?: string;
  readonly limit?: number;
}

export function listArtworks(filters: CatalogFilters, signal: AbortSignal): Promise<ListView<ArtworkSummaryView>> {
  return apiClient.get('/artworks', { query: { ...filters }, signal });
}

export function getArtwork(slug: string, signal: AbortSignal): Promise<ArtworkDetailView> {
  return apiClient.get(`/artworks/${encodeURIComponent(slug)}`, { signal });
}

export function listArtists(signal: AbortSignal): Promise<ListView<ArtistView>> {
  return apiClient.get('/artists', { signal });
}
