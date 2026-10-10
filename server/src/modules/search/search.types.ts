import { z } from 'zod';
import { ARTWORK_MEDIUMS } from '../artworks';
import { AUCTION_LIST_SORTS, AUCTION_STATUS_FILTERS } from '../auctions';

export const MAXIMUM_SEARCH_KEYWORDS = 6;
/** A month: further out than any auction runs. */
export const MAXIMUM_ENDING_WITHIN_HOURS = 24 * 30;
export const MAXIMUM_SEARCH_PRICE_CENTS = 1_000_000_000_00;

export const searchFiltersSchema = z.strictObject({
  keywords: z.array(z.string().min(2).max(40)).max(MAXIMUM_SEARCH_KEYWORDS),
  medium: z.enum(ARTWORK_MEDIUMS).nullable(),
  artist: z.string().min(2).max(80).nullable().describe('An artist’s name, slug, or user handle.'),
  status: z.enum(AUCTION_STATUS_FILTERS),
  minPriceCents: z.number().int().min(0).max(MAXIMUM_SEARCH_PRICE_CENTS).nullable(),
  maxPriceCents: z.number().int().min(0).max(MAXIMUM_SEARCH_PRICE_CENTS).nullable(),
  endingWithinHours: z.number().int().min(1).max(MAXIMUM_ENDING_WITHIN_HOURS).nullable(),
  sort: z.enum(AUCTION_LIST_SORTS),
});
export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  keywords: [],
  medium: null,
  artist: null,
  status: 'all',
  minPriceCents: null,
  maxPriceCents: null,
  endingWithinHours: null,
  sort: 'ending_soon',
};

/** keywords: parsed without the model. model: one structured call. fallback: the model failed, so keywords. explicit: the filters came in the URL. */
export const QUERY_INTERPRETATIONS = ['keywords', 'model', 'fallback', 'explicit'] as const;
export type QueryInterpretation = (typeof QUERY_INTERPRETATIONS)[number];

export interface InterpretedQuery {
  readonly filters: SearchFilters;
  readonly interpretation: QueryInterpretation;
}
