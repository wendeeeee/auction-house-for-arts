import { Link, useParams } from 'react-router';
import { isApiErrorWithCode } from '../../shared/api/api-error';
import { formatBasisPointsAsPercent } from '../../shared/format/basis-points';
import { useApiQuery } from '../../shared/api/use-api-query';
import { ErrorState, LoadingState } from '../../shared/ui/StatusMessage';
import { ArtworkImage } from './ArtworkImage';
import { getArtwork } from './artworks-api';

export function ArtworkDetailPage() {
  const { slug = '' } = useParams();
  const artwork = useApiQuery(`artwork:${slug}`, (signal) => getArtwork(slug, signal));

  if (artwork.status === 'loading') return <LoadingState label="Loading the artwork" />;

  if (artwork.status === 'error') {
    if (isApiErrorWithCode(artwork.error, 'ARTWORK_NOT_FOUND')) {
      return (
        <section className="page page--narrow">
          <p className="eyebrow">Not in the catalog</p>
          <h1 className="page-title">We couldn’t find that work.</h1>
          <p>
            <Link className="text-link" to="/artworks">
              Back to the catalog
            </Link>
          </p>
        </section>
      );
    }
    return <ErrorState error={artwork.error} />;
  }

  const work = artwork.data;
  return (
    <article className="artwork-detail">
      <div className="artwork-detail__image">
        <ArtworkImage slug={work.slug} title={work.title} size="large" />
      </div>

      <div className="artwork-detail__text">
        <p className="eyebrow">
          <Link className="text-link" to={`/artworks?artist=${work.artist.slug}`}>
            {work.artist.name}
          </Link>
        </p>
        <h1 className="artwork-detail__title">{work.title}</h1>

        <dl className="fact-list">
          <div>
            <dt>Year</dt>
            <dd>{work.year ?? 'Undated'}</dd>
          </div>
          <div>
            <dt>Medium</dt>
            <dd>{work.medium}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>{work.dimensions}</dd>
          </div>
          <div>
            <dt>Offered</dt>
            <dd>{work.saleType === 'primary' ? 'By the artist' : 'As a resale, by a collector'}</dd>
          </div>
        </dl>

        {work.description && <p className="artwork-detail__description">{work.description}</p>}

        <section className="artist-note">
          <h2 className="artist-note__heading">About the artist</h2>
          <p>{work.artist.bio}</p>
          <p className="artist-note__royalty">
            Resale royalty to the artist: {formatBasisPointsAsPercent(work.artist.royaltyBps)}
          </p>
        </section>

        <p>
          <Link className="text-link" to="/artworks">
            ← All works
          </Link>
        </p>
      </div>
    </article>
  );
}
