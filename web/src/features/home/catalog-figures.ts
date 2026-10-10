import { ARTWORK_MEDIUMS, type ArtistView, type ArtworkMedium, type ArtworkSummaryView } from '../../shared/api/api-types';

export interface MediumFigure {
  readonly medium: ArtworkMedium;
  readonly workCount: number;
}

export interface CatalogFigures {
  readonly workCount: number;
  readonly artistCount: number;
  readonly mediumsRepresented: number;
  /** Highest artist resale royalty in basis points, or null when there are no artists. */
  readonly highestRoyaltyBps: number | null;
  readonly resaleCount: number;
  /** Every medium, in catalog order, including those with no works yet. */
  readonly byMedium: readonly MediumFigure[];
}

/**
 * The landing page's figures, computed from real catalog data rather than written as copy, so
 * the page never claims more than the catalog holds. Pure, so it is unit-tested.
 */
export function computeCatalogFigures(
  artworks: readonly ArtworkSummaryView[],
  artists: readonly ArtistView[],
): CatalogFigures {
  const countsByMedium = new Map<ArtworkMedium, number>();
  for (const artwork of artworks) {
    countsByMedium.set(artwork.medium, (countsByMedium.get(artwork.medium) ?? 0) + 1);
  }

  return {
    workCount: artworks.length,
    artistCount: artists.length,
    mediumsRepresented: countsByMedium.size,
    highestRoyaltyBps: artists.length > 0 ? Math.max(...artists.map((artist) => artist.royaltyBps)) : null,
    resaleCount: artworks.filter((artwork) => artwork.saleType === 'resale').length,
    byMedium: ARTWORK_MEDIUMS.map((medium) => ({ medium, workCount: countsByMedium.get(medium) ?? 0 })),
  };
}
