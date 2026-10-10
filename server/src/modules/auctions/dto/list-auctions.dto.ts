import { z } from 'zod';
import { blankAsAbsent } from '../../../common/validation';
import { ARTWORK_MEDIUMS } from '../../artworks';
import { AUCTION_LIST_SORTS, AUCTION_STATUS_FILTERS } from '../auctions.types';

export const DEFAULT_AUCTION_PAGE_SIZE = 50;
export const MAXIMUM_AUCTION_PAGE_SIZE = 100;

export const listAuctionsQuerySchema = z.object({
  status: z.preprocess(blankAsAbsent, z.enum(AUCTION_STATUS_FILTERS).default('open')),
  medium: z.preprocess(blankAsAbsent, z.enum(ARTWORK_MEDIUMS).optional()),
  artwork: z.preprocess(
    blankAsAbsent,
    z.string().max(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be an artwork slug' }).optional(),
  ),
  sort: z.preprocess(blankAsAbsent, z.enum(AUCTION_LIST_SORTS).default('ending_soon')),
  limit: z.preprocess(
    blankAsAbsent,
    z.coerce.number().int().min(1).max(MAXIMUM_AUCTION_PAGE_SIZE).default(DEFAULT_AUCTION_PAGE_SIZE),
  ),
});

export type ListAuctionsQuery = z.infer<typeof listAuctionsQuerySchema>;
