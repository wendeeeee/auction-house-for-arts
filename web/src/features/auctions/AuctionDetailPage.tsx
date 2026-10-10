import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { isApiErrorWithCode } from '../../shared/api/api-error';
import type { AuctionDetailView } from '../../shared/api/api-types';
import { useApiQuery } from '../../shared/api/use-api-query';
import { formatCents } from '../../shared/format/money';
import { ErrorState, LoadingState } from '../../shared/ui/StatusMessage';
import { ArtworkImage } from '../artworks/ArtworkImage';
import { useDemoUserId } from '../demo-user/use-demo-user-id';
import { getAuction } from './auctions-api';
import { Countdown } from './Countdown';
import { MaximumBidForm } from './MaximumBidForm';
import { ReserveBadge } from './ReserveBadge';
import { describeTimeRemaining } from './time-remaining';
import { useLiveAuction } from './use-live-auction';
import { useNow } from './use-now';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function AuctionDetailPage() {
  const { slug = '' } = useParams();
  const demoUserId = useDemoUserId();
  // Bumped to refetch: after your own bid, and when anyone's bid changes the auction. The
  // viewer is part of the key: the detail shows your own maximum.
  const [refreshCount, setRefreshCount] = useState(0);
  const auction = useApiQuery(`auction:${slug}:${demoUserId ?? 'anonymous'}:${refreshCount}`, (signal) =>
    getAuction(slug, signal),
  );
  useLiveAuction(slug, () => setRefreshCount((count) => count + 1));

  // While a refetch loads, keep showing the last result for this auction instead of a spinner.
  const lastLoaded = useRef<AuctionDetailView | null>(null);
  if (auction.status === 'success') lastLoaded.current = auction.data;
  const shown =
    auction.status === 'success'
      ? auction.data
      : auction.status === 'loading' && lastLoaded.current?.slug === slug
        ? lastLoaded.current
        : null;

  if (!shown) {
    if (auction.status === 'error') {
      if (isApiErrorWithCode(auction.error, 'AUCTION_NOT_FOUND')) {
        return (
          <section className="page page--narrow">
            <p className="eyebrow">Not found</p>
            <h1 className="page-title">We couldn’t find that auction.</h1>
            <p>
              <Link className="text-link" to="/auctions">
                Back to auctions
              </Link>
            </p>
          </section>
        );
      }
      return <ErrorState error={auction.error} />;
    }
    return <LoadingState label="Loading the auction" />;
  }

  return <AuctionDetail auction={shown} isAnonymous={demoUserId === null} onBidPlaced={() => setRefreshCount((count) => count + 1)} />;
}

function AuctionDetail({
  auction,
  isAnonymous,
  onBidPlaced,
}: {
  auction: AuctionDetailView;
  isAnonymous: boolean;
  onBidPlaced: () => void;
}) {
  const now = useNow();
  const hasEnded = auction.status === 'ended' || describeTimeRemaining(new Date(auction.endsAt), now).hasEnded;
  const { artwork } = auction;

  return (
    <article className="artwork-detail">
      <div className="artwork-detail__image">
        <ArtworkImage slug={artwork.slug} title={artwork.title} size="large" />
      </div>

      <div className="artwork-detail__text">
        <p className="eyebrow">
          <Link className="text-link" to={`/artworks/${artwork.slug}`}>
            {artwork.artist.name}
          </Link>
        </p>
        <h1 className="artwork-detail__title">
          {artwork.title}
          {artwork.year !== null && <span className="artwork-card__year">, {artwork.year}</span>}
        </h1>

        <section className="auction-panel card card--raised" aria-label="Auction status">
          <div className="auction-panel__figures">
            <div>
              <p className="mono-label">{auction.bidCount === 0 ? 'Starting price' : 'Current bid'}</p>
              <p className="auction-panel__price">{formatCents(auction.priceCents)}</p>
            </div>
            <div>
              <p className="mono-label">{hasEnded ? 'Auction' : 'Ends in'}</p>
              <p className="auction-panel__time">{hasEnded ? 'Ended' : <Countdown endsAt={auction.endsAt} />}</p>
            </div>
          </div>

          <div className="auction-panel__meta">
            <ReserveBadge reserveStatus={auction.reserveStatus} />
            <span>
              {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
            </span>
            {auction.leaderHandle && (
              <span>
                Leading: <span className="auction-panel__handle">{auction.leaderHandle}</span>
              </span>
            )}
          </div>

          <p className="auction-panel__end">
            {hasEnded ? 'Ended' : 'Ends'} {dateTimeFormat.format(new Date(auction.endsAt))}
            {auction.extensionCount > 0 &&
              ` · extended ${auction.extensionCount} ${auction.extensionCount === 1 ? 'time' : 'times'} by late bids (originally ${timeFormat.format(new Date(auction.originalEndsAt))})`}
          </p>

          {auction.yourMaxBidCents !== null && (
            <p className={`auction-panel__yours${auction.youAreLeading ? ' auction-panel__yours--leading' : ''}`}>
              {auction.youAreLeading ? 'You’re the highest bidder.' : 'You’ve been outbid.'} Your maximum:{' '}
              <span className="auction-panel__amount">{formatCents(auction.yourMaxBidCents)}</span>
            </p>
          )}

          {!hasEnded && auction.youMayBid && <MaximumBidForm auction={auction} onBidPlaced={onBidPlaced} />}
          {!hasEnded && !auction.youMayBid && (
            <p className="auction-panel__note">
              {isAnonymous
                ? 'Choose a demo user under “Viewing as” to bid.'
                : 'You can’t bid on this auction: you are selling or own this work.'}
            </p>
          )}
        </section>

        <section className="bid-record auction-history" aria-labelledby="bid-history-heading">
          <p className="mono-label mono-label--gold">Public bid record</p>
          <h2 id="bid-history-heading" className="bid-record__title">
            Bid history
          </h2>
          {auction.history.length === 0 ? (
            <p className="bid-record__note">No bids yet. Starting price {formatCents(auction.startingPriceCents)}.</p>
          ) : (
            <ol className="bid-record__rows">
              {auction.history.map((entry, index) => (
                <li
                  key={`${entry.createdAt}-${index}`}
                  className={`bid-record__row${index === 0 ? ' bid-record__row--leading' : ''}`}
                >
                  <span className="bid-record__time">{timeFormat.format(new Date(entry.createdAt))}</span>
                  <span>
                    {entry.bidderHandle}
                    {entry.kind === 'automatic' && <span className="bid-record__kind"> · automatic</span>}
                  </span>
                  <span className="bid-record__amount">{formatCents(entry.amountCents)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="bid-record__note">
            Automatic bids are placed by the system for a bidder, up to their private maximum.
          </p>
        </section>

        <p>
          Sold by <span className="auction-panel__handle">{auction.sellerHandle}</span> ·{' '}
          <Link className="text-link" to="/auctions">
            ← All auctions
          </Link>
        </p>
      </div>
    </article>
  );
}
