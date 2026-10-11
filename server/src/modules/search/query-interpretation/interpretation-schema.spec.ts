import { EMPTY_SEARCH_FILTERS } from '../search.types';
import { INTERPRETATION_JSON_SCHEMA, toSearchFilters } from './interpretation-schema';

const NOTHING = {
  keywords: [],
  medium: null,
  artist: null,
  status: 'all',
  minPriceDollars: null,
  maxPriceDollars: null,
  endingWithinHours: null,
  sort: 'ending_soon',
};

describe('INTERPRETATION_JSON_SCHEMA', () => {
  it('is strict: every property is required and nothing else is allowed', () => {
    expect(INTERPRETATION_JSON_SCHEMA.additionalProperties).toBe(false);
    expect([...INTERPRETATION_JSON_SCHEMA.required].sort()).toEqual(Object.keys(INTERPRETATION_JSON_SCHEMA.properties).sort());
  });
});

describe('toSearchFilters', () => {
  it('maps the example query to the filters the chips show', () => {
    expect(
      toSearchFilters({ ...NOTHING, keywords: ['Oil', 'art'], medium: 'Painting', status: 'open', maxPriceDollars: 5_000, endingWithinHours: 168 }),
    ).toEqual({
      ...EMPTY_SEARCH_FILTERS,
      keywords: ['oil'],
      medium: 'Painting',
      status: 'open',
      maxPriceCents: 500_000,
      endingWithinHours: 168,
    });
  });

  it('normalizes an artist handle and ignores non-positive numbers', () => {
    expect(toSearchFilters({ ...NOTHING, artist: '@mei_tanaka', minPriceDollars: 0, endingWithinHours: -3 })).toEqual({
      ...EMPTY_SEARCH_FILTERS,
      artist: 'mei_tanaka',
    });
  });

  it('caps the ending window at a month', () => {
    expect(toSearchFilters({ ...NOTHING, endingWithinHours: 10_000 }).endingWithinHours).toBe(720);
  });

  it('throws on output that does not match the schema', () => {
    expect(() => toSearchFilters({ ...NOTHING, status: 'maybe' })).toThrow();
    expect(() => toSearchFilters({ ...NOTHING, medium: 'Tapestry' })).toThrow();
    expect(() => toSearchFilters({ ...NOTHING, extra: true })).toThrow();
    expect(() => toSearchFilters('not an object')).toThrow();
  });
});
