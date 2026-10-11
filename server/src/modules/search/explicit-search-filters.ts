import type { SearchQuery } from './dto/search.dto';
import { SearchFilters } from './search.types';

/** A filter set in the URL always wins over the interpretation of the text, so removing a chip or changing a select sticks. */
export function applyExplicitFilters(filters: SearchFilters, query: SearchQuery): SearchFilters {
  return {
    keywords: query.keywords ?? filters.keywords,
    medium: query.medium ?? filters.medium,
    artist: query.artist ?? filters.artist,
    status: query.status ?? filters.status,
    minPriceCents: query.minPrice === undefined ? filters.minPriceCents : query.minPrice * 100,
    maxPriceCents: query.maxPrice === undefined ? filters.maxPriceCents : query.maxPrice * 100,
    endingWithinHours: query.endingWithinHours ?? filters.endingWithinHours,
    sort: query.sort ?? filters.sort,
  };
}
