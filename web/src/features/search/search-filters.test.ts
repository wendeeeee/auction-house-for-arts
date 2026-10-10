import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchAuctions } from './search-api';
import { type SearchFilters, describeEndingWindow, filterChips, filtersToParams, searchHref, withoutChip } from './search-filters';

afterEach(() => vi.unstubAllGlobals());

const NONE: SearchFilters = {
  keywords: [],
  medium: null,
  artist: null,
  status: 'all',
  minPriceCents: null,
  maxPriceCents: null,
  endingWithinHours: null,
  sort: 'ending_soon',
};
const INTERPRETED: SearchFilters = {
  ...NONE,
  keywords: ['oil'],
  medium: 'Painting',
  status: 'open',
  maxPriceCents: 500_000,
  endingWithinHours: 168,
};

describe('search filters in the URL', () => {
  it('encodes only non-default filters and marks them as already interpreted', () => {
    expect(filtersToParams('Open oil paintings under $5k ending this week', INTERPRETED).toString()).toBe(
      'q=Open+oil+paintings+under+%245k+ending+this+week&mode=filters&keywords=oil&medium=Painting&status=open&maxPrice=5000&endingWithinHours=168',
    );
    expect(filtersToParams('', { ...NONE, sort: 'price_low', artist: 'mei_tanaka' }).toString()).toBe(
      'mode=filters&artist=mei_tanaka&sort=price_low',
    );
  });

  it('links the header search to the search page', () => {
    expect(searchHref('  oil paintings ')).toBe('/search?q=oil+paintings');
    expect(searchHref('')).toBe('/search');
  });
});

describe('filter chips', () => {
  it('shows the example query as the chips the user expects', () => {
    expect(filterChips(INTERPRETED).map((chip) => chip.label)).toEqual([
      'Open auctions',
      'Painting',
      'Under $5,000',
      'Ending this week',
      '“oil”',
    ]);
  });

  it('removes exactly the chip that was clicked', () => {
    expect(withoutChip(INTERPRETED, 'status').status).toBe('all');
    expect(withoutChip(INTERPRETED, 'keyword:oil').keywords).toEqual([]);
    expect(withoutChip(INTERPRETED, 'medium').medium).toBeNull();
    expect(filterChips(withoutChip(INTERPRETED, 'maxPrice')).map((chip) => chip.id)).not.toContain('maxPrice');
    expect(withoutChip(INTERPRETED, 'unknown')).toEqual(INTERPRETED);
  });

  it('describes ending windows in words', () => {
    expect(describeEndingWindow(24)).toBe('Ending within a day');
    expect(describeEndingWindow(6)).toBe('Ending within 6h');
    expect(describeEndingWindow(72)).toBe('Ending within 3 days');
  });
});

describe('searchAuctions', () => {
  it('requests results with the current URL parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ query: '', interpretation: 'explicit', filters: NONE, items: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await searchAuctions(new URLSearchParams('q=open+paintings&status=open'), new AbortController().signal);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/search?q=open+paintings&status=open');
  });
});
