import { z } from 'zod';
import { artistViewSchema, toArtistView } from '../artists';
import type { ArtworkWithArtist } from './artwork-catalog.service';
import { ARTWORK_MEDIUMS } from './artworks.types';
import { resolveSaleType } from './sale-type';

export const artworkSummaryViewSchema = z.object({
  slug: z.string(),
  title: z.string(),
  year: z.number().int().nullable(),
  medium: z.enum(ARTWORK_MEDIUMS),
  dimensions: z.string(),
  artist: z.object({ slug: z.string(), name: z.string() }),
  saleType: z.enum(['primary', 'resale']).describe('primary: the artist owns it; resale: a collector does.'),
});
export type ArtworkSummaryView = z.infer<typeof artworkSummaryViewSchema>;

export const artworkListViewSchema = z.object({ items: z.array(artworkSummaryViewSchema) });
export type ArtworkListView = z.infer<typeof artworkListViewSchema>;

export const artworkDetailViewSchema = artworkSummaryViewSchema.extend({
  description: z.string(),
  ownerUserId: z.uuid(),
  artist: artistViewSchema,
});
export type ArtworkDetailView = z.infer<typeof artworkDetailViewSchema>;

export function toArtworkSummaryView({ artwork, artist }: ArtworkWithArtist): ArtworkSummaryView {
  return {
    slug: artwork.slug,
    title: artwork.title,
    year: artwork.year,
    medium: artwork.medium,
    dimensions: artwork.dimensions,
    artist: { slug: artist.slug, name: artist.name },
    saleType: resolveSaleType(artwork.ownerUserId, artist.userId),
  };
}

export function toArtworkDetailView(artworkWithArtist: ArtworkWithArtist): ArtworkDetailView {
  const { artwork, artist } = artworkWithArtist;
  return {
    ...toArtworkSummaryView(artworkWithArtist),
    description: artwork.description,
    ownerUserId: artwork.ownerUserId,
    artist: toArtistView(artist),
  };
}
