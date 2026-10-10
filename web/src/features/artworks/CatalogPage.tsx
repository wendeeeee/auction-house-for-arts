import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ARTWORK_MEDIUMS, type ArtworkMedium } from '../../shared/api/api-types';
import { useApiQuery } from '../../shared/api/use-api-query';
import { EmptyState, ErrorState, LoadingState } from '../../shared/ui/StatusMessage';
import { ArtworkCard } from './ArtworkCard';
import { type CatalogFilters, listArtists, listArtworks } from './artworks-api';

function isMedium(value: string | null): value is ArtworkMedium {
  return value !== null && (ARTWORK_MEDIUMS as readonly string[]).includes(value);
}

/** Filters live in the URL, so a filtered catalog can be bookmarked, shared, and navigated back to. */
function readFilters(searchParams: URLSearchParams): CatalogFilters {
  const medium = searchParams.get('medium');
  return {
    query: searchParams.get('query') ?? undefined,
    medium: isMedium(medium) ? medium : undefined,
    artist: searchParams.get('artist') ?? undefined,
  };
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readFilters(searchParams);
  const [queryDraft, setQueryDraft] = useState(filters.query ?? '');

  // Keep the text box in step with the URL when it changes from outside (back/forward).
  useEffect(() => setQueryDraft(filters.query ?? ''), [filters.query]);

  const artworks = useApiQuery(`artworks?${searchParams.toString()}`, (signal) => listArtworks(filters, signal));
  const artists = useApiQuery('artists', listArtists);

  function updateFilter(name: keyof CatalogFilters, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set(name, value.trim());
    else next.delete(name);
    setSearchParams(next);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateFilter('query', queryDraft);
  }

  const hasFilters = Boolean(filters.query || filters.medium || filters.artist);

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">The catalog</p>
        <h1 className="page-title">Works on view</h1>
      </header>

      <div className="catalog-filters" role="search">
        <form className="catalog-filters__search" onSubmit={submitSearch}>
          <label className="visually-hidden" htmlFor="catalog-query">
            Search titles and artists
          </label>
          <input
            id="catalog-query"
            className="text-input"
            type="search"
            placeholder="Search titles and artists"
            value={queryDraft}
            maxLength={100}
            onChange={(event) => setQueryDraft(event.target.value)}
          />
          <button className="button" type="submit">
            Search
          </button>
        </form>

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
          <span className="select-field__label">Artist</span>
          <select className="select-input" value={filters.artist ?? ''} onChange={(event) => updateFilter('artist', event.target.value)}>
            <option value="">All artists</option>
            {artists.status === 'success' &&
              artists.data.items.map((artist) => (
                <option key={artist.slug} value={artist.slug}>
                  {artist.name}
                </option>
              ))}
          </select>
        </label>

        {hasFilters && (
          <button className="button button--quiet" type="button" onClick={() => setSearchParams(new URLSearchParams())}>
            Clear filters
          </button>
        )}
      </div>

      {artworks.status === 'loading' && <LoadingState label="Loading the catalog" />}
      {artworks.status === 'error' && <ErrorState error={artworks.error} />}
      {artworks.status === 'success' &&
        (artworks.data.items.length === 0 ? (
          <EmptyState>No works match these filters.</EmptyState>
        ) : (
          <>
            <p className="result-count">
              {artworks.data.items.length} {artworks.data.items.length === 1 ? 'work' : 'works'}
            </p>
            <div className="artwork-grid">
              {artworks.data.items.map((artwork) => (
                <ArtworkCard key={artwork.slug} artwork={artwork} />
              ))}
            </div>
          </>
        ))}
    </section>
  );
}
