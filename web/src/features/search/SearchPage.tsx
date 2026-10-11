import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
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
import { AuctionCard } from '../auctions/AuctionCard';
import { searchAuctions } from './search-api';
import {
  SORT_LABELS,
  STATUS_LABELS,
  type SearchFilters,
  filterChips,
  filtersToParams,
  withoutChip,
} from './search-filters';

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramString = searchParams.toString();

  // After the server interprets the text, the URL is rewritten to the explicit filters, so a
  // reload or a shared link never asks the model again. That rewrite must not refetch.
  const pinned = useRef<{ readonly from: string; readonly to: string } | null>(null);
  const fetchedParams = pinned.current?.to === paramString ? pinned.current.from : paramString;
  const result = useApiQuery(`search?${fetchedParams}`, (signal) => searchAuctions(new URLSearchParams(fetchedParams), signal));

  useEffect(() => {
    if (result.status !== 'success' || result.data.interpretation === 'explicit') return;
    const explicit = filtersToParams(result.data.query, result.data.filters).toString();
    if (explicit === paramString) return;
    pinned.current = { from: fetchedParams, to: explicit };
    setSearchParams(new URLSearchParams(explicit), { replace: true });
  }, [result]);

  const query = searchParams.get('q') ?? '';
  const data = result.status === 'success' ? result.data : null;
  const filters = data?.filters ?? null;
  const chips = filters ? filterChips(filters) : [];

  function goTo(next: SearchFilters) {
    pinned.current = null;
    navigate(`/search?${filtersToParams(query, next).toString()}`);
  }

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">Search</p>
        <h1 className="page-title">{query ? `Results for “${query}”` : 'All auctions'}</h1>
      </header>

      {filters && (
        <div className="catalog-filters">
          <label className="select-field">
            <span className="select-field__label">Status</span>
            <select
              className="select-input"
              value={filters.status}
              onChange={(event) => goTo({ ...filters, status: event.target.value as AuctionStatusFilter })}
            >
              {AUCTION_STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span className="select-field__label">Medium</span>
            <select
              className="select-input"
              value={filters.medium ?? ''}
              onChange={(event) => goTo({ ...filters, medium: (event.target.value || null) as ArtworkMedium | null })}
            >
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
            <select
              className="select-input"
              value={filters.sort}
              onChange={(event) => goTo({ ...filters, sort: event.target.value as AuctionListSort })}
            >
              {AUCTION_LIST_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {filters && chips.length > 0 && (
        <div className="filter-chips" aria-label="Active filters">
          {data?.interpretation === 'model' && <span className="mono-label mono-label--gold">Understood as</span>}
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="chip filter-chip"
              aria-label={`Remove filter ${chip.label}`}
              onClick={() => goTo(withoutChip(filters, chip.id))}
            >
              {chip.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <Link className="text-link" to="/search">
            Clear all
          </Link>
        </div>
      )}
      {data?.interpretation === 'fallback' && (
        <p className="section-note" role="status">
          Searched by keywords: the smart search is unavailable right now.
        </p>
      )}

      {result.status === 'loading' && <LoadingState label="Searching auctions" />}
      {result.status === 'error' && <ErrorState error={result.error} />}
      {data &&
        (data.items.length === 0 ? (
          <EmptyState>
            {chips.length > 0 ? 'No auctions match. Try removing a filter above.' : 'Try describing what you want, like “open prints under $500”.'}
          </EmptyState>
        ) : (
          <>
            <p className="result-count" role="status">
              {data.items.length} {data.items.length === 1 ? 'auction' : 'auctions'}
            </p>
            <div className="artwork-grid">
              {data.items.map((auction) => (
                <AuctionCard key={auction.slug} auction={auction} />
              ))}
            </div>
          </>
        ))}
    </section>
  );
}
