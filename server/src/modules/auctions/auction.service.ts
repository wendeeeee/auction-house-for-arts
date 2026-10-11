import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { InvariantViolationError, ValidationFailedError } from '../../common/errors';
import { AuthenticatedUser } from '../../common/identity';
import { isUniqueViolation } from '../../database';
import { ArtworkCatalogService, ArtworkWithArtist } from '../artworks';
import { UsersService } from '../users';
import { AuctionRepository, ONE_UNCLOSED_AUCTION_PER_ARTWORK_INDEX } from './auction.repository';
import { decideAuctionEndProblem } from './auction-schedule';
import { ArtworkAlreadyAtAuctionError, AuctionNotFoundError, NotArtworkOwnerError } from './auctions.errors';
import { Auction, AuctionListSort, AuctionStatusFilter, BidHistoryEntry, MaximumBid } from './auctions.types';
import { BidHistoryRepository } from './bid-history.repository';
import { CreateAuctionBody } from './dto/create-auction.dto';
import { ListAuctionsQuery } from './dto/list-auctions.dto';
import { MaximumBidRepository } from './maximum-bid.repository';

/** How many history rows the detail page shows, newest first. */
const DETAIL_HISTORY_LIMIT = 50;

export interface AuctionListing {
  readonly auction: Auction;
  readonly artwork: ArtworkWithArtist;
}

export interface ParticipantAuction extends AuctionListing {
  /** The participant's own maximum; null when they are the seller or have not bid. */
  readonly ownMaximumBidCents: number | null;
}

export interface AuctionSearchCriteria {
  /** Null: no artwork filter. An empty list matches nothing. */
  readonly artworkIds: readonly string[] | null;
  readonly status: AuctionStatusFilter;
  readonly minimumPriceCents: number | null;
  readonly maximumPriceCents: number | null;
  readonly endingWithinHours: number | null;
  readonly sort: AuctionListSort;
  readonly limit: number;
}

export interface AuctionDetails extends AuctionListing {
  /** Newest first. */
  readonly history: readonly BidHistoryEntry[];
  readonly handlesByUserId: ReadonlyMap<string, string>;
  /** The requesting user and their own maximum; null when anonymous. */
  readonly viewer: { readonly userId: string; readonly maximumBid: MaximumBid | null } | null;
}

/**
 * Creating and reading auctions. Bidding lives in BiddingService, because it is the only path
 * that locks. Artwork and user data come from those modules' public services, not SQL joins.
 */
@Injectable()
export class AuctionService {
  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly maximumBidRepository: MaximumBidRepository,
    private readonly bidHistoryRepository: BidHistoryRepository,
    private readonly artworkCatalog: ArtworkCatalogService,
    private readonly usersService: UsersService,
    private readonly clock: Clock,
  ) {}

  async createAuction(seller: AuthenticatedUser, body: CreateAuctionBody): Promise<AuctionDetails> {
    const artwork = await this.artworkCatalog.getArtworkBySlug(body.artworkSlug);
    if (artwork.artwork.ownerUserId !== seller.id) throw new NotArtworkOwnerError(body.artworkSlug);

    const endProblem = decideAuctionEndProblem(body.endsAt, this.clock.now());
    if (endProblem !== null) throw new ValidationFailedError([{ path: 'endsAt', message: endProblem }]);

    let auction: Auction;
    try {
      auction = await this.auctionRepository.insert({
        slug: createAuctionSlug(artwork.artwork.slug),
        artworkId: artwork.artwork.id,
        sellerUserId: seller.id,
        startingPriceCents: body.startingPriceCents,
        reservePriceCents: body.reservePriceCents ?? null,
        endsAt: body.endsAt,
        createdAt: this.clock.now(),
      });
    } catch (error) {
      // The partial unique index decides, not a prior SELECT: two concurrent requests for the
      // same artwork cannot both pass a check-then-insert, but only one can pass the index.
      if (isUniqueViolation(error, ONE_UNCLOSED_AUCTION_PER_ARTWORK_INDEX)) {
        throw new ArtworkAlreadyAtAuctionError(body.artworkSlug);
      }
      throw error;
    }
    return this.loadDetails(auction, artwork, seller);
  }

  async listAuctions(query: ListAuctionsQuery): Promise<AuctionListing[]> {
    const artworkIds = await this.resolveArtworkFilter(query);
    // A filter that matches no artwork matches no auction; it is not an error.
    if (artworkIds !== undefined && artworkIds.length === 0) return [];
    const auctions = await this.auctionRepository.list({
      status: query.status,
      now: this.clock.now(),
      artworkIds,
      sort: query.sort,
      limit: query.limit,
    });
    return this.attachArtworks(auctions);
  }

  async searchAuctions(criteria: AuctionSearchCriteria): Promise<AuctionListing[]> {
    if (criteria.artworkIds !== null && criteria.artworkIds.length === 0) return [];
    const now = this.clock.now();
    const auctions = await this.auctionRepository.list({
      status: criteria.status,
      now,
      artworkIds: criteria.artworkIds ?? undefined,
      minimumPriceCents: criteria.minimumPriceCents ?? undefined,
      maximumPriceCents: criteria.maximumPriceCents ?? undefined,
      endsAtOrBefore:
        criteria.endingWithinHours === null
          ? undefined
          : new Date(now.getTime() + criteria.endingWithinHours * 60 * 60 * 1_000),
      sort: criteria.sort,
      limit: criteria.limit,
    });
    return this.attachArtworks(auctions);
  }

  async listAuctionsForParticipant(userId: string, limit: number): Promise<ParticipantAuction[]> {
    const auctions = await this.auctionRepository.listForParticipant(userId, limit);
    const [listings, ownMaximums] = await Promise.all([
      this.attachArtworks(auctions),
      this.maximumBidRepository.listForBidderOnAuctions(
        userId,
        auctions.map((auction) => auction.id),
      ),
    ]);
    return listings.map((listing) => ({ ...listing, ownMaximumBidCents: ownMaximums.get(listing.auction.id) ?? null }));
  }

  async getAuctionDetails(slug: string, viewer: AuthenticatedUser | null): Promise<AuctionDetails> {
    const auction = await this.auctionRepository.findBySlug(slug);
    if (!auction) throw new AuctionNotFoundError(slug);
    const [listing] = await this.attachArtworks([auction]);
    if (!listing) throw new InvariantViolationError('attachArtworks dropped an auction.', { slug });
    return this.loadDetails(auction, listing.artwork, viewer);
  }

  /**
   * Reads without the bidding lock: the detail page can be a moment stale, and phase 3 tells
   * viewers to refetch. Correctness of bids never depends on this read.
   */
  private async loadDetails(
    auction: Auction,
    artwork: ArtworkWithArtist,
    viewer: AuthenticatedUser | null,
  ): Promise<AuctionDetails> {
    const [history, viewerMaximumBid] = await Promise.all([
      this.bidHistoryRepository.listForAuction(auction.id, DETAIL_HISTORY_LIMIT),
      viewer ? this.maximumBidRepository.findForBidder(auction.id, viewer.id) : Promise.resolve(null),
    ]);
    const userIds = [auction.sellerUserId, ...(auction.leaderUserId ? [auction.leaderUserId] : [])].concat(
      history.map((entry) => entry.bidderUserId),
    );
    const users = await this.usersService.findUsersByIds(userIds);

    return {
      auction,
      artwork,
      history,
      handlesByUserId: new Map(users.map((user) => [user.id, user.handle])),
      viewer: viewer ? { userId: viewer.id, maximumBid: viewerMaximumBid } : null,
    };
  }

  /** The artwork IDs the `medium` and `artwork` filters allow (both together: the intersection), or undefined for no filter. */
  private async resolveArtworkFilter(query: ListAuctionsQuery): Promise<string[] | undefined> {
    let artworkIds: string[] | undefined;
    if (query.medium !== undefined) artworkIds = await this.artworkCatalog.findArtworkIdsByMedium(query.medium);
    if (query.artwork !== undefined) {
      const artworkId = await this.artworkCatalog.findArtworkIdBySlug(query.artwork);
      const bySlug = artworkId === null ? [] : [artworkId];
      artworkIds = artworkIds === undefined ? bySlug : bySlug.filter((id) => artworkIds?.includes(id));
    }
    return artworkIds;
  }

  private async attachArtworks(auctions: readonly Auction[]): Promise<AuctionListing[]> {
    const artworks = await this.artworkCatalog.findArtworksByIds(auctions.map((auction) => auction.artworkId));
    const artworksById = new Map(artworks.map((artwork) => [artwork.artwork.id, artwork]));
    return auctions.map((auction) => {
      const artwork = artworksById.get(auction.artworkId);
      if (!artwork) {
        throw new InvariantViolationError('An auction references a missing artwork.', { auctionId: auction.id });
      }
      return { auction, artwork };
    });
  }
}

/**
 * Readable and unique enough: the artwork slug plus 6 random base-36 characters (about 2
 * billion values). A collision would fail the unique constraint as a 500, which is acceptable
 * at this scale. Retrying would be the fix if it ever mattered.
 */
function createAuctionSlug(artworkSlug: string): string {
  const suffix = randomBytes(4).readUInt32BE(0).toString(36).padStart(6, '0').slice(-6);
  return `${artworkSlug}-${suffix}`;
}
