import { EMPTY_SEARCH_FILTERS } from '../search.types';
import { cleanKeywords, looksLikeNaturalLanguage, parseKeywordQuery } from './keyword-query-parser';

describe('looksLikeNaturalLanguage', () => {
  it('sends only sentence-like queries to the model', () => {
    expect(looksLikeNaturalLanguage('harmattan')).toBe(false);
    expect(looksLikeNaturalLanguage('quiet bronze')).toBe(false);
    expect(looksLikeNaturalLanguage('I am looking for auctions that are open')).toBe(true);
    expect(looksLikeNaturalLanguage('paintings under $5k')).toBe(true);
  });
});

describe('parseKeywordQuery', () => {
  it('keeps plain keywords and drops filler', () => {
    expect(parseKeywordQuery('the harmattan light artwork')).toEqual({ ...EMPTY_SEARCH_FILTERS, keywords: ['harmattan', 'light'] });
  });

  it('reads a medium, a status, and price bounds', () => {
    expect(parseKeywordQuery('open etchings below $1,500')).toEqual({
      ...EMPTY_SEARCH_FILTERS,
      medium: 'Print',
      status: 'open',
      maxPriceCents: 150_000,
    });
    expect(parseKeywordQuery('bronze sculpture over 5k')).toEqual({
      ...EMPTY_SEARCH_FILTERS,
      keywords: ['bronze'],
      medium: 'Sculpture',
      minPriceCents: 500_000,
    });
  });

  it('rounds price bounds to whole dollars', () => {
    expect(parseKeywordQuery('under 99.6').maxPriceCents).toBe(10_000);
  });

  it('reads an @handle as the artist and simple ending phrases', () => {
    expect(parseKeywordQuery('@mei_tanaka photos ending today')).toEqual({
      ...EMPTY_SEARCH_FILTERS,
      artist: 'mei_tanaka',
      medium: 'Photography',
      endingWithinHours: 24,
    });
    expect(parseKeywordQuery('open oil paintings under $5k ending this week')).toEqual({
      ...EMPTY_SEARCH_FILTERS,
      keywords: ['oil'],
      medium: 'Painting',
      status: 'open',
      maxPriceCents: 500_000,
      endingWithinHours: 168,
    });
  });

  it('marks ended searches', () => {
    expect(parseKeywordQuery('sold drawings').status).toBe('ended');
  });
});

describe('cleanKeywords', () => {
  it('lowercases, deduplicates, and drops filler and odd lengths', () => {
    expect(cleanKeywords([' Oil ', 'oil', 'artwork', 'x', 'Seascape'])).toEqual(['oil', 'seascape']);
  });
});
