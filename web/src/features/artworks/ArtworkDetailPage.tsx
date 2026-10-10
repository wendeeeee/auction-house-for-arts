import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { isApiErrorWithCode } from '../../shared/api/api-error';
import type { ArtworkImageView } from '../../shared/api/api-types';
import { formatBasisPointsAsPercent } from '../../shared/format/basis-points';
import { formatCents } from '../../shared/format/money';
import { useApiQuery } from '../../shared/api/use-api-query';
import { ErrorState, LoadingState } from '../../shared/ui/StatusMessage';
import { listAuctions } from '../auctions/auctions-api';
import { PutUpForAuctionForm } from '../auctions/PutUpForAuctionForm';
import { useDemoUserId } from '../demo-user/use-demo-user-id';
import { ArtworkGallery } from './ArtworkGallery';
import { ImageManager } from './ImageManager';
import { getArtwork } from './artworks-api';
import { toGalleryImages } from './images/gallery-images';

export function ArtworkDetailPage() {
  const { slug = '' } = useParams();
  const artwork = useApiQuery(`artwork:${slug}`, (signal) => getArtwork(slug, signal));
  const openAuctions = useApiQuery(`artwork-auctions:${slug}`, (signal) =>
    listAuctions({ artwork: slug, status: 'open' }, signal),
  );
  const demoUserId = useDemoUserId();
  // The owner's latest list, so the gallery shows new photos without reloading the artwork.
  const [ownerGallery, setOwnerGallery] = useState<{ slug: string; images: readonly ArtworkImageView[] } | null>(null);

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
  const openAuction = openAuctions.status === 'success' ? openAuctions.data.items[0] : undefined;
  const isOwner = demoUserId !== null && demoUserId === work.ownerUserId;
  return (
    <article className="artwork-detail">
      <div className="artwork-detail__image">
        <ArtworkGallery
          slug={work.slug}
          title={work.title}
          images={ownerGallery?.slug === work.slug ? ownerGallery.images : work.images}
        />
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

        {openAuction && (
          <Link to={`/auctions/${openAuction.slug}`} className="auction-panel card card--raised card--interactive auction-link">
            <span className="mono-label mono-label--gold">At auction now</span>
            <span className="auction-link__price">
              {openAuction.bidCount === 0 ? 'Starting at' : 'Current bid'} {formatCents(openAuction.priceCents)}
            </span>
            <span className="text-link">Go to the auction →</span>
          </Link>
        )}
        {openAuctions.status === 'success' && !openAuction && isOwner && <PutUpForAuctionForm artworkSlug={work.slug} />}
        {isOwner && (
          <ImageManager
            artworkSlug={work.slug}
            onImagesChanged={(images) => setOwnerGallery({ slug: work.slug, images: toGalleryImages(images) })}
          />
        )}

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
