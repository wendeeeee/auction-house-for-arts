import { type FormEvent, type ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ArtistView, ArtworkSummaryView, ListView } from '../../shared/api/api-types';
import { type ApiQueryState, useApiQuery } from '../../shared/api/use-api-query';
import { formatBasisPointsAsPercent } from '../../shared/format/basis-points';
import { ArrowRightIcon, ListIcon, PaletteIcon, ScrollIcon, ShieldIcon } from '../../shared/ui/icons';
import { ErrorState, LoadingState } from '../../shared/ui/StatusMessage';
import { artworkPlaceholderDataUri } from '../artworks/artwork-placeholder';
import { listArtists, listArtworks } from '../artworks/artworks-api';
import { type CatalogFigures, computeCatalogFigures } from './catalog-figures';

/** Enough for the whole demo catalog; the figures say "in the catalog", which stays true at this size. */
const FIGURES_SAMPLE_LIMIT = 100;

export function HomePage() {
  const artworks = useApiQuery('home:artworks', (signal) => listArtworks({ limit: FIGURES_SAMPLE_LIMIT }, signal));
  const artists = useApiQuery('home:artists', listArtists);
  const figures = combineFigures(artworks, artists);

  return (
    <>
      <HeroSection />
      <MediumsSection figures={figures} isLoading={artworks.status === 'loading'} error={errorOf(artworks)} />
      <BiddingOptionsSection />
      <TrustSection highestRoyaltyBps={figures?.highestRoyaltyBps ?? null} />
      <FiguresSection figures={figures} />
      <ArtistsSection artists={artists} />
    </>
  );
}

function combineFigures(
  artworks: ApiQueryState<ListView<ArtworkSummaryView>>,
  artists: ApiQueryState<ListView<ArtistView>>,
): CatalogFigures | null {
  if (artworks.status !== 'success' || artists.status !== 'success') return null;
  return computeCatalogFigures(artworks.data.items, artists.data.items);
}

function errorOf(state: ApiQueryState<unknown>): unknown {
  return state.status === 'error' ? state.error : null;
}

function SectionHeading({ eyebrow, title, tone = 'blue', children }: {
  eyebrow: string;
  title: string;
  tone?: 'blue' | 'amber';
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div className="section-heading__text">
        <p className={`eyebrow eyebrow--${tone}`}>{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
      </div>
      {children && <div className="section-heading__aside">{children}</div>}
    </div>
  );
}

/* ---- Hero ---- */

function HeroSection() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    navigate(text ? `/artworks?query=${encodeURIComponent(text)}` : '/artworks');
  }

  return (
    <section className="hero">
      <div className="hero__grid container">
        <div className="hero__copy">
          <span className="pill">Proxy bidding · Soft close · Artist royalties</span>
          <h1 className="hero__title">
            Original art, auctioned with <span className="hero__highlight">every bid on the record</span>
          </h1>
          <p className="hero__lede">
            Discover paintings, prints, photography, sculpture, drawing, and digital work, sold by the artists who made
            them and the collectors who own them now.
          </p>
          <div className="button-row">
            <Link className="button button--primary" to="/artworks">
              Browse the catalog
            </Link>
            <a className="button button--outline" href="#how-to-bid">
              How bidding works
            </a>
          </div>
          <form className="search-panel" role="search" onSubmit={search}>
            <label className="visually-hidden" htmlFor="hero-search">
              Search titles and artists
            </label>
            <input
              id="hero-search"
              className="text-input search-panel__input"
              type="search"
              placeholder="Search titles and artists"
              maxLength={100}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="button button--primary" type="submit">
              Search works
            </button>
          </form>
        </div>

        <aside className="hero__status card">
          <p className="card__title">No auctions are live yet</p>
          <p className="card__body">
            Bidding opens with the next release. Until then, the whole catalog is on view: see what is coming up for
            auction and which artists earn a royalty when their work is resold.
          </p>
          <Link className="text-link" to="/artworks">
            Explore the catalog
          </Link>
        </aside>
      </div>
    </section>
  );
}

/* ---- What we auction ---- */

function MediumsSection({ figures, isLoading, error }: { figures: CatalogFigures | null; isLoading: boolean; error: unknown }) {
  return (
    <section className="band band--white">
      <div className="container section">
        <SectionHeading eyebrow="What we auction" title="Six mediums, one catalog" tone="amber">
          <p>Every work is catalogued with its artist, medium, dimensions, and whether it is a first sale or a resale.</p>
        </SectionHeading>
        {isLoading && <LoadingState label="Counting the catalog" />}
        {Boolean(error) && <ErrorState error={error} />}
        {figures && (
          <div className="medium-grid">
            {figures.byMedium.map(({ medium, workCount }, index) => (
              <Link key={medium} className="medium-card card card--interactive" to={`/artworks?medium=${medium}`}>
                <span className="medium-card__top">
                  <img
                    className="medium-card__swatch"
                    src={artworkPlaceholderDataUri(`medium-${medium.toLowerCase()}`, { width: 88, height: 88 })}
                    alt=""
                    width={44}
                    height={44}
                  />
                  <span className="mono-label">{String(index + 1).padStart(2, '0')}</span>
                </span>
                <span className="medium-card__name">{medium}</span>
                <span className="medium-card__meta">
                  <span>
                    {workCount} {workCount === 1 ? 'work' : 'works'}
                  </span>
                  <ArrowRightIcon className="medium-card__arrow" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---- How you can bid ---- */

const BIDDING_OPTIONS = [
  {
    label: '01 · Place a bid',
    text: 'Bid the next increment shown on the lot. Increments rise with the price, so every step is meaningful.',
  },
  {
    label: '02 · Set a maximum',
    text: 'Tell us the most you will pay. We bid for you, one increment at a time, only as far as needed to keep you in the lead.',
  },
  {
    label: '03 · Win at the close',
    text: 'A bid in the final minutes extends the auction, so nobody wins by sniping in the last second.',
  },
];

function BiddingOptionsSection() {
  return (
    <section id="how-to-bid" className="container section">
      <SectionHeading eyebrow="How you can bid" title="Three ways to bid, one fair close" />
      <div className="option-grid">
        {BIDDING_OPTIONS.map((option) => (
          <div key={option.label} className="card card--padded">
            <p className="mono-label mono-label--gold">{option.label}</p>
            <p className="card__body">{option.text}</p>
          </div>
        ))}
      </div>
      <p className="section-note">Hidden reserve prices protect sellers: a work only sells once its reserve is met.</p>
    </section>
  );
}

/* ---- Why collectors trust us ---- */

const EXAMPLE_BID_RECORD = [
  { time: '14:02:51', bidder: 'Bidder ••42', amountCents: 480_000, isLeading: true },
  { time: '14:02:50', bidder: 'Bidder ••17', amountCents: 460_000, isLeading: false },
  { time: '14:01:12', bidder: 'Bidder ••42', amountCents: 440_000, isLeading: false },
  { time: '13:58:40', bidder: 'Bidder ••08', amountCents: 400_000, isLeading: false },
];

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function TrustSection({ highestRoyaltyBps }: { highestRoyaltyBps: number | null }) {
  const features = [
    {
      icon: <ShieldIcon />,
      title: 'Fair proxy bidding',
      text: 'Your maximum stays private. The system only bids what is needed, and ties go to the earliest bid.',
    },
    {
      icon: <ScrollIcon />,
      title: 'Provenance on file',
      text: 'Each work records its artist and current owner, so you always know whether you are buying first-hand.',
    },
    {
      icon: <ListIcon />,
      title: 'A public bid record',
      text: 'Every bid is timestamped and kept. Bidder identities are masked; amounts and order are not.',
    },
    {
      icon: <PaletteIcon />,
      title: 'Artists paid on resale',
      text:
        highestRoyaltyBps === null
          ? 'When a collector resells a work, its artist receives a royalty from the hammer price.'
          : `When a collector resells a work, its artist receives a royalty of up to ${formatBasisPointsAsPercent(highestRoyaltyBps)}.`,
    },
  ];

  return (
    <section id="trust" className="band band--cloud">
      <div className="container section">
        <SectionHeading eyebrow="Why collectors trust us" title="Transparent from first bid to final payment" />
        <div className="trust-grid">
          <div className="feature-grid">
            {features.map((feature) => (
              <div key={feature.title} className="card card--padded card--raised">
                <span className="icon-tile">{feature.icon}</span>
                <h3 className="card__title">{feature.title}</h3>
                <p className="card__body">{feature.text}</p>
              </div>
            ))}
          </div>

          <div className="bid-record">
            <p className="mono-label mono-label--gold">Public bid record</p>
            <h3 className="bid-record__title">Harmattan Light, lot 12</h3>
            <ol className="bid-record__rows">
              {EXAMPLE_BID_RECORD.map((bid) => (
                <li key={bid.time} className={`bid-record__row${bid.isLeading ? ' bid-record__row--leading' : ''}`}>
                  <span className="bid-record__time">{bid.time}</span>
                  <span>{bid.bidder}</span>
                  <span className="bid-record__amount">{dollars.format(bid.amountCents / 100)}</span>
                </li>
              ))}
            </ol>
            <p className="bid-record__note">Example record. Live bidding arrives in the next release.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---- Figures and sellers ---- */

const SELLER_STEPS = ['01 Catalogue the work', '02 Set a hidden reserve', '03 Auction with a soft close', '04 Settle and pay royalties'];

function FiguresSection({ figures }: { figures: CatalogFigures | null }) {
  const stats = figures
    ? [
        { value: String(figures.workCount), label: 'Works in the catalog' },
        { value: String(figures.artistCount), label: 'Artists represented' },
        { value: String(figures.resaleCount), label: 'Works offered for resale' },
        {
          value: figures.highestRoyaltyBps === null ? '—' : formatBasisPointsAsPercent(figures.highestRoyaltyBps),
          label: 'Highest artist royalty',
        },
      ]
    : null;

  return (
    <section id="sellers" className="band band--white band--top-rule">
      <div className="container section">
        {stats && (
          <div className="stat-grid">
            {stats.map((stat) => (
              <div key={stat.label} className="card card--padded">
                <div className="stat__value">{stat.value}</div>
                <div className="stat__label">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="cta-band">
          <div>
            <p className="mono-label mono-label--gold">For artists and collectors</p>
            <h2 className="cta-band__title">Selling a work? We run the sale end to end, and the artist is paid on every resale.</h2>
            <p className="cta-band__text">
              From cataloguing to settlement, every step is recorded, and payouts are split automatically between seller,
              artist, and house.
            </p>
            <div className="badge-row">
              {SELLER_STEPS.map((step) => (
                <span key={step} className="badge badge--dark">
                  {step}
                </span>
              ))}
            </div>
          </div>
          <Link className="button button--gold" to="/artworks">
            Explore the catalog
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---- Artists ---- */

function ArtistsSection({ artists }: { artists: ApiQueryState<ListView<ArtistView>> }) {
  return (
    <section id="artists" className="band band--cloud">
      <div className="container section">
        <SectionHeading eyebrow="Artists in the catalog" title="Meet the artists" />
        {artists.status === 'loading' && <LoadingState />}
        {artists.status === 'error' && <ErrorState error={artists.error} />}
        {artists.status === 'success' && (
          <div className="chip-row">
            {artists.data.items.map((artist) => (
              <Link key={artist.slug} className="chip" to={`/artworks?artist=${artist.slug}`}>
                {artist.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
