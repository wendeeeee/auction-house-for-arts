import { z } from 'zod';
import { artistViewSchema, toArtistView } from '../artists';
import { artworkImageViewSchema, toArtworkImageViews, toCoverImageView } from '../images';
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
  coverImage: artworkImageViewSchema.nullable().describe('Null until an image is processed; the web app shows a placeholder.'),
});
export type ArtworkSummaryView = z.infer<typeof artworkSummaryViewSchema>;

export const artworkListViewSchema = z.object({ items: z.array(artworkSummaryViewSchema) });
export type ArtworkListView = z.infer<typeof artworkListViewSchema>;

export const artworkDetailViewSchema = artworkSummaryViewSchema.extend({
  description: z.string(),
  ownerUserId: z.uuid(),
  artist: artistViewSchema,
  images: z.array(artworkImageViewSchema).describe('Processed images in gallery order.'),
});
export type ArtworkDetailView = z.infer<typeof artworkDetailViewSchema>;

export function toArtworkSummaryView({ artwork, artist, images }: ArtworkWithArtist): ArtworkSummaryView {
  return {
    slug: artwork.slug,
    title: artwork.title,
    year: artwork.year,
    medium: artwork.medium,
    dimensions: artwork.dimensions,
    artist: { slug: artist.slug, name: artist.name },
    saleType: resolveSaleType(artwork.ownerUserId, artist.userId),
    coverImage: toCoverImageView(images),
  };
}

export function toArtworkDetailView(artworkWithArtist: ArtworkWithArtist): ArtworkDetailView {
  const { artwork, artist, images } = artworkWithArtist;
  return {
    ...toArtworkSummaryView(artworkWithArtist),
    description: artwork.description,
    ownerUserId: artwork.ownerUserId,
    artist: toArtistView(artist),
    images: toArtworkImageViews(images),
  };
}
