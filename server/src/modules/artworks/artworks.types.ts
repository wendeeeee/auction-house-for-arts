/** Mirrors the `artworks_medium_known` CHECK constraint in 001_catalog.sql. */
export const ARTWORK_MEDIUMS = ['Painting', 'Print', 'Photography', 'Sculpture', 'Drawing', 'Digital'] as const;
export type ArtworkMedium = (typeof ARTWORK_MEDIUMS)[number];

export interface Artwork {
  readonly id: string;
  readonly slug: string;
  readonly artistId: string;
  readonly title: string;
  readonly year: number | null;
  readonly medium: ArtworkMedium;
  readonly dimensions: string;
  readonly description: string;
  readonly ownerUserId: string;
  readonly createdAt: Date;
}

/** Primary: the artist sells their own work. Resale: a collector sells it, and the artist earns a royalty (phase 5). */
export type SaleType = 'primary' | 'resale';
