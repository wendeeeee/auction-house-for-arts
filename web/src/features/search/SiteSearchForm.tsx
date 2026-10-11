import { type FormEvent, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { searchHref } from './search-filters';

/** The header search. Plain words or a sentence such as “open oil paintings under $5k”. */
export function SiteSearchForm({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const inputId = useId();
  const [query, setQuery] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(searchHref(query));
    setQuery('');
  }

  return (
    <form className={`site-search ${className}`} role="search" onSubmit={submit}>
      <label className="visually-hidden" htmlFor={inputId}>
        Search auctions
      </label>
      <input
        id={inputId}
        className="text-input site-search__input"
        type="search"
        placeholder="Search auctions…"
        maxLength={200}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button className="button button--primary site-search__button" type="submit">
        Search
      </button>
    </form>
  );
}
