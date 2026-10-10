import { z } from 'zod';
import { blankAsAbsent } from '../../../common/validation';
import { ARTWORK_MEDIUMS } from '../artworks.types';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const DEFAULT_ARTWORK_PAGE_SIZE = 50;
export const MAXIMUM_ARTWORK_PAGE_SIZE = 100;

export const listArtworksQuerySchema = z.object({
  query: z.preprocess(blankAsAbsent, z.string().max(100).optional()),
  medium: z.preprocess(blankAsAbsent, z.enum(ARTWORK_MEDIUMS).optional()),
  artist: z.preprocess(blankAsAbsent, z.string().max(80).regex(SLUG_PATTERN, { error: 'must be an artist slug' }).optional()),
  limit: z.preprocess(
    blankAsAbsent,
    z.coerce.number().int().min(1).max(MAXIMUM_ARTWORK_PAGE_SIZE).default(DEFAULT_ARTWORK_PAGE_SIZE),
  ),
});

export type ListArtworksQuery = z.infer<typeof listArtworksQuerySchema>;
