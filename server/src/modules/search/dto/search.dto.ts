import { z } from 'zod';
import { blankAsAbsent } from '../../../common/validation';
import { ARTWORK_MEDIUMS } from '../../artworks';
import { AUCTION_LIST_SORTS, AUCTION_STATUS_FILTERS } from '../../auctions';
import { MAXIMUM_ENDING_WITHIN_HOURS, MAXIMUM_SEARCH_KEYWORDS } from '../search.types';

export const DEFAULT_SEARCH_PAGE_SIZE = 48;
export const MAXIMUM_SEARCH_PAGE_SIZE = 100;
const MAXIMUM_PRICE_DOLLARS = 1_000_000_000;

const wholeDollars = z.coerce.number().int().min(0).max(MAXIMUM_PRICE_DOLLARS).optional();

export const searchQuerySchema = z.object({
  q: z.preprocess(blankAsAbsent, z.string().max(200).default('')),
  mode: z.preprocess(blankAsAbsent, z.enum(['filters']).optional()),
  keywords: z.preprocess(
    blankAsAbsent,
    z
      .string()
      .max(400)
      .transform((text) => text.split(',').map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))
      .pipe(z.array(z.string().min(2).max(40)).max(MAXIMUM_SEARCH_KEYWORDS))
      .optional(),
  ),
  medium: z.preprocess(blankAsAbsent, z.enum(ARTWORK_MEDIUMS).optional()),
  artist: z.preprocess(blankAsAbsent, z.string().min(2).max(80).optional()),
  status: z.preprocess(blankAsAbsent, z.enum(AUCTION_STATUS_FILTERS).optional()),
  minPrice: z.preprocess(blankAsAbsent, wholeDollars),
  maxPrice: z.preprocess(blankAsAbsent, wholeDollars),
  endingWithinHours: z.preprocess(blankAsAbsent, z.coerce.number().int().min(1).max(MAXIMUM_ENDING_WITHIN_HOURS).optional()),
  sort: z.preprocess(blankAsAbsent, z.enum(AUCTION_LIST_SORTS).optional()),
  limit: z.preprocess(
    blankAsAbsent,
    z.coerce.number().int().min(1).max(MAXIMUM_SEARCH_PAGE_SIZE).default(DEFAULT_SEARCH_PAGE_SIZE),
  ),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
