import { ArtworkMedium } from '../../artworks';
import { EMPTY_SEARCH_FILTERS, MAXIMUM_SEARCH_KEYWORDS, SearchFilters } from '../search.types';

const MEDIUM_ALIASES: Readonly<Record<string, ArtworkMedium>> = {
  painting: 'Painting',
  paintings: 'Painting',
  print: 'Print',
  prints: 'Print',
  etching: 'Print',
  etchings: 'Print',
  woodcut: 'Print',
  woodcuts: 'Print',
  lithograph: 'Print',
  lithographs: 'Print',
  serigraph: 'Print',
  serigraphs: 'Print',
  photo: 'Photography',
  photos: 'Photography',
  photograph: 'Photography',
  photographs: 'Photography',
  photography: 'Photography',
  sculpture: 'Sculpture',
  sculptures: 'Sculpture',
  drawing: 'Drawing',
  drawings: 'Drawing',
  sketch: 'Drawing',
  sketches: 'Drawing',
  digital: 'Digital',
};

const OPEN_WORDS = new Set(['open', 'live', 'active', 'current', 'running']);
const ENDED_WORDS = new Set(['ended', 'closed', 'finished', 'sold', 'past']);
const FILLER_WORDS = new Set([
  'art', 'artwork', 'artworks', 'piece', 'pieces', 'work', 'works', 'auction', 'auctions', 'bid', 'bids', 'lot', 'lots',
]);
const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'any', 'are', 'am', 'as', 'at', 'be', 'by', 'can', 'do', 'for', 'from', 'get', 'have', 'i',
  'im', 'in', 'is', 'it', 'looking', 'me', 'my', 'need', 'of', 'on', 'or', 'please', 'show', 'some', 'that', 'the',
  'there', 'these', 'this', 'those', 'to', 'want', 'what', 'which', 'with', 'you', 'ending', 'ends', 'soon', 'today',
  'tomorrow', 'week', 'still',
]);

const INTENT_WORDS =
  /\b(under|over|below|above|less|more|cheap|cheapest|expensive|ending|ends|ended|closing|closed|open|live|active|today|tomorrow|week|between|budget|looking|need|want|show|find|with|for|by)\b|\$|\d+\s*k\b/i;
const PRICE_PHRASE = /\b(under|below|less than|max|over|above|more than|min)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/gi;
const HANDLE = /(^|\s)@([a-z0-9][a-z0-9_]{2,31})\b/i;

/** Only sentence-like queries go to the model: short keyword searches never pay for a call. */
export function looksLikeNaturalLanguage(query: string): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean);
  return words.length >= 4 || (words.length >= 2 && INTENT_WORDS.test(query));
}

/** Search prices are whole dollars, so a bound is rounded to the nearest dollar, then made cents. */
export function wholeDollarsToCents(dollars: number): number {
  return Math.round(dollars) * 100;
}

/** The no-model path: keywords, plus the few signals that are unambiguous without a model. */
export function parseKeywordQuery(query: string): SearchFilters {
  let minPriceCents: number | null = null;
  let maxPriceCents: number | null = null;
  const withoutPrices = query.replace(PRICE_PHRASE, (_match, direction: string, amount: string, thousands?: string) => {
    const cents = wholeDollarsToCents(Number(amount.replace(/,/g, '')) * (thousands ? 1_000 : 1));
    if (/under|below|less|max/i.test(direction)) maxPriceCents = cents;
    else minPriceCents = cents;
    return ' ';
  });

  const artist = HANDLE.exec(withoutPrices)?.[2]?.toLowerCase() ?? null;
  const lowered = withoutPrices.replace(HANDLE, ' ').toLowerCase();
  const endingWithinHours = /\bending (today|soon)\b/.test(lowered)
    ? 24
    : /\bthis week\b/.test(lowered)
      ? 24 * 7
      : null;

  const words = lowered.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean);
  const medium = words.map((word) => MEDIUM_ALIASES[word]).find(Boolean) ?? null;
  const status = words.some((word) => OPEN_WORDS.has(word))
    ? 'open'
    : words.some((word) => ENDED_WORDS.has(word))
      ? 'ended'
      : 'all';
  const keywords = words.filter(
    (word) =>
      word.length >= 2 &&
      word.length <= 40 &&
      !STOP_WORDS.has(word) &&
      !FILLER_WORDS.has(word) &&
      MEDIUM_ALIASES[word] === undefined &&
      !OPEN_WORDS.has(word) &&
      !ENDED_WORDS.has(word),
  );

  return {
    ...EMPTY_SEARCH_FILTERS,
    keywords: [...new Set(keywords)].slice(0, MAXIMUM_SEARCH_KEYWORDS),
    medium,
    artist,
    status,
    minPriceCents,
    maxPriceCents,
    endingWithinHours,
  };
}

/** Model keywords get the same cleanup as parsed ones: lowercase, unique, no filler. */
export function cleanKeywords(keywords: readonly string[]): string[] {
  return [...new Set(keywords.map((keyword) => keyword.trim().toLowerCase()))]
    .filter((keyword) => keyword.length >= 2 && keyword.length <= 40 && !FILLER_WORDS.has(keyword))
    .slice(0, MAXIMUM_SEARCH_KEYWORDS);
}
