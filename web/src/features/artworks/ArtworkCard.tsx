import { Link } from 'react-router';
import type { ArtworkSummaryView } from '../../shared/api/api-types';
import { ArtworkImage } from './ArtworkImage';

export function ArtworkCard({ artwork }: { artwork: ArtworkSummaryView }) {
  return (
    <article className="artwork-card">
      <Link to={`/artworks/${artwork.slug}`} className="artwork-card__link">
        <ArtworkImage slug={artwork.slug} title={artwork.title} />
        <div className="artwork-card__caption">
          <p className="artwork-card__artist">{artwork.artist.name}</p>
          <h3 className="artwork-card__title">
            {artwork.title}
            {artwork.year !== null && <span className="artwork-card__year">, {artwork.year}</span>}
          </h3>
          <p className="artwork-card__meta">
            {artwork.medium} · {artwork.saleType === 'primary' ? 'From the artist' : 'Resale'}
          </p>
        </div>
      </Link>
    </article>
  );
}
