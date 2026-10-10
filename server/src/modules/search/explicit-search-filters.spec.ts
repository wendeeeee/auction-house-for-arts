import { searchQuerySchema } from './dto/search.dto';
import { applyExplicitFilters } from './explicit-search-filters';
import { EMPTY_SEARCH_FILTERS } from './search.types';

const interpreted = { ...EMPTY_SEARCH_FILTERS, keywords: ['oil'], medium: 'Painting' as const, status: 'open' as const };

describe('applyExplicitFilters', () => {
  it('keeps the interpretation where the URL is silent', () => {
    expect(applyExplicitFilters(interpreted, searchQuerySchema.parse({ q: 'oil paintings' }))).toEqual(interpreted);
  });

  it('lets URL filters override, with prices in whole dollars', () => {
    const query = searchQuerySchema.parse({ medium: 'Print', status: 'all', maxPrice: '5000', keywords: 'Sea, harbour', sort: 'price_high' });
    expect(applyExplicitFilters(interpreted, query)).toEqual({
      ...EMPTY_SEARCH_FILTERS,
      keywords: ['sea', 'harbour'],
      medium: 'Print',
      status: 'all',
      maxPriceCents: 500_000,
      sort: 'price_high',
    });
  });
});
