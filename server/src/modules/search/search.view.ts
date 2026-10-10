import { z } from 'zod';
import { auctionSummaryViewSchema } from '../auctions';
import { QUERY_INTERPRETATIONS, searchFiltersSchema } from './search.types';

export const searchResultViewSchema = z.object({
  query: z.string(),
  interpretation: z.enum(QUERY_INTERPRETATIONS).describe('How the text became filters; "explicit" when the URL carried them.'),
  filters: searchFiltersSchema.describe('The filters applied, for the chips. Prices are cents.'),
  items: z.array(auctionSummaryViewSchema),
});
export type SearchResultView = z.infer<typeof searchResultViewSchema>;
