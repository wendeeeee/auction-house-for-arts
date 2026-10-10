import { useSearchParams } from 'react-router';
import {
  ARTWORK_MEDIUMS,
  AUCTION_LIST_SORTS,
  AUCTION_STATUS_FILTERS,
  type ArtworkMedium,
  type AuctionListSort,
  type AuctionStatusFilter,
} from '../../shared/api/api-types';
import { useApiQuery } from '../../shared/api/use-api-query';
import { EmptyState, ErrorState, LoadingState } from '../../shared/ui/StatusMessage';
import { AuctionCard } from './AuctionCard';
import { type AuctionListFilters, listAuctions } from './auctions-api';

const STATUS_LABELS: Record<AuctionStatusFilter, string> = { open: 'Open', ended: 'Ended', all: 'All' };
const SORT_LABELS: Record<AuctionListSort, string> = {
  ending_soon: 'Ending soonest',
  price_low: 'Price: low to high',
  price_high: 'Price: high to low',
  most_bids: 'Most bids',
};

function pick<T extends string>(allowed: readonly T[], value: string | null): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Filters live in the URL, as in the catalog, so a view can be bookmarked and shared. */
function readFilters(searchParams: URLSearchParams): AuctionListFilters {
  return {
    status: pick(AUCTION_STATUS_FILTERS, searchParams.get('status')),
    medium: pick<ArtworkMedium>(ARTWORK_MEDIUMS, searchParams.get('medium')),
    sort: pick(AUCTION_LIST_SORTS, searchParams.get('sort')),
  };
}

export function AuctionListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readFilters(searchParams);
  const auctions = useApiQuery(`auctions?${searchParams.toString()}`, (signal) => listAuctions(filters, signal));

  function updateFilter(name: keyof AuctionListFilters, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next);
  }

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">Live auctions</p>
        <h1 className="page-title">Bid on original work</h1>
      </header>

      <div className="catalog-filters">
        <label className="select-field">
          <span className="select-field__label">Status</span>
          <select className="select-input" value={filters.status ?? 'open'} onChange={(event) => updateFilter('status', event.target.value)}>
            {AUCTION_STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="select-field">
          <span className="select-field__label">Medium</span>
          <select className="select-input" value={filters.medium ?? ''} onChange={(event) => updateFilter('medium', event.target.value)}>
            <option value="">All mediums</option>
            {ARTWORK_MEDIUMS.map((medium) => (
              <option key={medium} value={medium}>
                {medium}
              </option>
            ))}
          </select>
        </label>

        <label className="select-field">
          <span className="select-field__label">Sort</span>
          <select className="select-input" value={filters.sort ?? 'ending_soon'} onChange={(event) => updateFilter('sort', event.target.value)}>
            {AUCTION_LIST_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {auctions.status === 'loading' && <LoadingState label="Loading auctions" />}
      {auctions.status === 'error' && <ErrorState error={auctions.error} />}
      {auctions.status === 'success' &&
        (auctions.data.items.length === 0 ? (
          <EmptyState>No auctions match these filters.</EmptyState>
        ) : (
          <>
            <p className="result-count">
              {auctions.data.items.length} {auctions.data.items.length === 1 ? 'auction' : 'auctions'}
            </p>
            <div className="artwork-grid">
              {auctions.data.items.map((auction) => (
                <AuctionCard key={auction.slug} auction={auction} />
              ))}
            </div>
          </>
        ))}
    </section>
  );
}
