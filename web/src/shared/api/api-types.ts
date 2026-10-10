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
