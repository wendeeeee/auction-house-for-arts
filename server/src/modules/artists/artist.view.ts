import { z } from 'zod';
import { Artist } from './artists.types';

export const artistViewSchema = z.object({
  slug: z.string(),
  name: z.string(),
  bio: z.string(),
  royaltyBps: z.number().int().describe('Resale royalty in basis points (500 = 5%).'),
});
export type ArtistView = z.infer<typeof artistViewSchema>;

export const artistListViewSchema = z.object({ items: z.array(artistViewSchema) });
export type ArtistListView = z.infer<typeof artistListViewSchema>;

export function toArtistView(artist: Artist): ArtistView {
  return { slug: artist.slug, name: artist.name, bio: artist.bio, royaltyBps: artist.royaltyBps };
}
