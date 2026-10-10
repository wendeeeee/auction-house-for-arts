import type { ArtworkMedium, AuctionListSort, AuctionStatusFilter, AuctionSummaryView } from '../../shared/api/api-types';
import { formatCents } from '../../shared/format/money';

export interface SearchFilters {
  readonly keywords: readonly string[];
  readonly medium: ArtworkMedium | null;
  readonly artist: string | null;
  readonly status: AuctionStatusFilter;
  readonly minPriceCents: number | null;
  readonly maxPriceCents: number | null;
  readonly endingWithinHours: number | null;
  readonly sort: AuctionListSort;
}

export type QueryInterpretation = 'keywords' | 'model' | 'fallback' | 'explicit';

export interface SearchResultView {
  readonly query: string;
  readonly interpretation: QueryInterpretation;
  readonly filters: SearchFilters;
  readonly items: readonly AuctionSummaryView[];
}

export const SORT_LABELS: Record<AuctionListSort, string> = {
  ending_soon: 'Ending soonest',
  price_low: 'Price: low to high',
  price_high: 'Price: high to low',
  most_bids: 'Most bids',
};

export const STATUS_LABELS: Record<AuctionStatusFilter, string> = { all: 'All auctions', open: 'Open', ended: 'Ended' };

/** Search prices are whole dollars, so the cents from the server are exact multiples of 100. */
function toWholeDollars(cents: number): string {
  return String((cents - (cents % 100)) / 100);
}

/**
 * The URL for a set of filters. `mode=filters` tells the server they are already decided, so the
 * text is never sent to the model again: not on reload, back, a shared link, or a removed chip.
 */
export function filtersToParams(query: string, filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  params.set('mode', 'filters');
  if (filters.keywords.length > 0) params.set('keywords', filters.keywords.join(','));
  if (filters.medium) params.set('medium', filters.medium);
  if (filters.artist) params.set('artist', filters.artist);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.minPriceCents !== null) params.set('minPrice', toWholeDollars(filters.minPriceCents));
  if (filters.maxPriceCents !== null) params.set('maxPrice', toWholeDollars(filters.maxPriceCents));
  if (filters.endingWithinHours !== null) params.set('endingWithinHours', String(filters.endingWithinHours));
  if (filters.sort !== 'ending_soon') params.set('sort', filters.sort);
  return params;
}

export interface FilterChip {
  readonly id: string;
  readonly label: string;
}

export function describeEndingWindow(hours: number): string {
  if (hours === 24) return 'Ending within a day';
  if (hours === 24 * 7) return 'Ending this week';
  if (hours < 48) return `Ending within ${hours}h`;
  return `Ending within ${Math.round(hours / 24)} days`;
}

export function filterChips(filters: SearchFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.status !== 'all') chips.push({ id: 'status', label: filters.status === 'open' ? 'Open auctions' : 'Ended auctions' });
  if (filters.medium) chips.push({ id: 'medium', label: filters.medium });
  if (filters.artist) chips.push({ id: 'artist', label: `By ${filters.artist}` });
  if (filters.minPriceCents !== null) chips.push({ id: 'minPrice', label: `Over ${formatCents(filters.minPriceCents)}` });
  if (filters.maxPriceCents !== null) chips.push({ id: 'maxPrice', label: `Under ${formatCents(filters.maxPriceCents)}` });
  if (filters.endingWithinHours !== null) chips.push({ id: 'ending', label: describeEndingWindow(filters.endingWithinHours) });
  for (const keyword of filters.keywords) chips.push({ id: `keyword:${keyword}`, label: `“${keyword}”` });
  return chips;
}

export function withoutChip(filters: SearchFilters, chipId: string): SearchFilters {
  if (chipId.startsWith('keyword:')) {
    const keyword = chipId.slice('keyword:'.length);
    return { ...filters, keywords: filters.keywords.filter((candidate) => candidate !== keyword) };
  }
  switch (chipId) {
    case 'status':
      return { ...filters, status: 'all' };
    case 'medium':
      return { ...filters, medium: null };
    case 'artist':
      return { ...filters, artist: null };
    case 'minPrice':
      return { ...filters, minPriceCents: null };
    case 'maxPrice':
      return { ...filters, maxPriceCents: null };
    case 'ending':
      return { ...filters, endingWithinHours: null };
    default:
      return filters;
  }
}

export function searchHref(query: string): string {
  const text = query.trim();
  return text ? `/search?${new URLSearchParams({ q: text }).toString()}` : '/search';
}
