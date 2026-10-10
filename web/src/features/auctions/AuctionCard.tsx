import { Link } from 'react-router';
import type { AuctionSummaryView } from '../../shared/api/api-types';
import { formatCents } from '../../shared/format/money';
import { ArtworkImage } from '../artworks/ArtworkImage';
import { Countdown } from './Countdown';
import { ReserveBadge } from './ReserveBadge';

export function AuctionCard({ auction }: { auction: AuctionSummaryView }) {
  const { artwork } = auction;
  return (
    <article className="artwork-card">
      <Link to={`/auctions/${auction.slug}`} className="artwork-card__link">
        <ArtworkImage slug={artwork.slug} title={artwork.title} image={artwork.coverImage} />
        <div className="artwork-card__caption">
          <p className="artwork-card__artist">{artwork.artist.name}</p>
          <h3 className="artwork-card__title">
            {artwork.title}
            {artwork.year !== null && <span className="artwork-card__year">, {artwork.year}</span>}
          </h3>
          <div className="auction-card__figures">
            <span>
              <span className="mono-label">{auction.bidCount === 0 ? 'Starting at' : 'Current bid'}</span>
              <span className="auction-card__price">{formatCents(auction.priceCents)}</span>
            </span>
            <span className="auction-card__time">
              <span className="mono-label">{auction.status === 'ended' ? 'Status' : 'Ends in'}</span>
              <Countdown endsAt={auction.endsAt} />
            </span>
          </div>
          <p className="artwork-card__meta auction-card__meta">
            <span>
              {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
            </span>
            <ReserveBadge reserveStatus={auction.reserveStatus} />
          </p>
        </div>
      </Link>
    </article>
  );
}
