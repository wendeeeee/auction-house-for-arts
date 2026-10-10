import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser } from '../../common/identity';
import { withSpan } from '../../common/tracing';
import { APP_CONFIG, AppConfig } from '../../config';
import { UnitOfWork } from '../../database';
import { ArtworkCatalogService } from '../artworks';
import { AUCTION_EVENT_PUBLISHER, AuctionChangeAnnouncement, AuctionEventPublisher } from '../realtime';
import { AuctionRepository } from './auction.repository';
import { AuctionNotFoundError } from './auctions.errors';
import { BidHistoryRepository } from './bid-history.repository';
import { decideAuctionChangeAnnouncement } from './bidding/auction-change-events';
import { assertAuctionIsOpen } from './bidding/auction-status';
import { decideBidHistoryEntries, hasPriceOrLeaderChanged } from './bidding/bid-history-entries';
import { assertBidderIsEligible } from './bidding/bidder-eligibility';
import {
  ProxyBidState,
  assertMaximumBidIsAcceptable,
  computeMinimumNextBidCents,
  replaceMaximumBid,
  resolveProxyBids,
} from './bidding/proxy-bid-resolution';
import { decideSoftCloseExtension } from './bidding/soft-close';
import { MaximumBidRepository } from './maximum-bid.repository';

export interface PlaceMaximumBidOutcome {
  /** False when an existing maximum outbid the bidder at once. The bid is still accepted. */
  readonly isLeading: boolean;
  readonly priceCents: number;
  readonly minimumNextBidCents: number;
  readonly endsAt: Date;
  readonly isExtended: boolean;
}

interface CommittedBid {
  readonly outcome: PlaceMaximumBidOutcome;
  readonly announcement: AuctionChangeAnnouncement;
}

/**
 * Placing a maximum bid: lock, decide with the pure rules, write, commit.
 *
 * ## Lock order (defined here; every module that touches an auction follows it)
 * 1. The `auctions` row, with `SELECT … FOR UPDATE` (AuctionRepository.lockAuctionForBidding).
 * 2. Then, and only while holding it, that auction's `max_bids` and `bid_history` rows.
 * No other rows are locked. Reads of other modules' tables (the artwork's owner) are plain
 * reads, not locks.
 *
 * Taking one lock first, always the same one, means two transactions on the same auction
 * queue on it instead of deadlocking or interleaving. The close worker (phase 4) must take the
 * same auction row lock and re-check `ends_at` after getting it. Then a soft-close extension
 * and a close cannot both win: whichever locks second sees the other's committed write. A bid
 * that extended the auction makes the worker's stale "this has ended" selection false, and a
 * close that committed first makes the bid fail as AUCTION_ENDED.
 *
 * ## Why a row lock, not SERIALIZABLE or a version check
 * A bidding war is many writers on one row. SERIALIZABLE and optimistic version checks both
 * detect the conflict late and abort, so callers need a retry loop. Near the deadline a retry
 * can land after `ends_at`, and a bid sent in time is rejected. The row lock makes waiters
 * queue and then run against fresh state. Nothing aborts. The cost is per-auction throughput
 * of one bid per transaction, a few milliseconds, which is plenty for people bidding.
 *
 * ## Announcing only after commit
 * The real-time announcement goes out after `unitOfWork.run` resolves, that is after COMMIT.
 * Published inside the unit, a bid that then failed to commit would already have shown every
 * viewer a price that never existed. Publishing after commit can lose an announcement (the
 * process dies in between), which costs one stale screen until the next refetch; announcing a
 * phantom bid cannot be taken back.
 */
@Injectable()
export class BiddingService {
  private readonly logger = new Logger(BiddingService.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly auctionRepository: AuctionRepository,
    private readonly maximumBidRepository: MaximumBidRepository,
    private readonly bidHistoryRepository: BidHistoryRepository,
    private readonly artworkCatalog: ArtworkCatalogService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AUCTION_EVENT_PUBLISHER) private readonly eventPublisher: AuctionEventPublisher,
  ) {}

  async placeMaximumBid(bidder: AuthenticatedUser, auctionSlug: string, maxBidCents: number): Promise<PlaceMaximumBidOutcome> {
    // A nested unit joins the caller's transaction, so "run() resolved" would no longer mean
    // "committed", and the announcement below could precede a rollback.
    if (this.unitOfWork.isInTransaction) {
      throw new InvariantViolationError('placeMaximumBid must own its transaction, so it can announce after commit.');
    }

    const { outcome, announcement } = await withSpan('auctions.place_maximum_bid', { 'auction.slug': auctionSlug }, () =>
      // One short transaction with no network calls inside: it holds the auction lock, and
      // every other bidder on this auction waits for it.
      this.unitOfWork.run(async (): Promise<CommittedBid> => {
        const auction = await this.auctionRepository.lockAuctionForBidding(auctionSlug);
        if (!auction) throw new AuctionNotFoundError(auctionSlug);

        // Read the clock only now, after the lock: a bid that waited behind others is judged
        // at the moment it actually runs, against the ends_at those others may have extended.
        const acceptedAt = this.clock.now();
        assertAuctionIsOpen(auction, acceptedAt);

        const [artwork] = await this.artworkCatalog.findArtworksByIds([auction.artworkId]);
        if (!artwork) {
          throw new InvariantViolationError('An auction references a missing artwork.', { auctionId: auction.id });
        }
        assertBidderIsEligible({
          bidderUserId: bidder.id,
          sellerUserId: auction.sellerUserId,
          ownerUserId: artwork.artwork.ownerUserId,
        });

        const state: ProxyBidState = {
          startingPriceCents: auction.startingPriceCents,
          reservePriceCents: auction.reservePriceCents,
          maximumBids: await this.maximumBidRepository.listForAuction(auction.id),
        };
        const before = resolveProxyBids(state);
        assertMaximumBidIsAcceptable(state, before, { bidderUserId: bidder.id, maxBidCents });

        const placedBid = await this.maximumBidRepository.placeOrReplace({
          auctionId: auction.id,
          bidderUserId: bidder.id,
          maxCents: maxBidCents,
          placedAt: acceptedAt,
        });
        const after = resolveProxyBids({ ...state, maximumBids: replaceMaximumBid(state.maximumBids, placedBid) });

        const historyEntries = decideBidHistoryEntries(before, after, { bidderUserId: bidder.id, maxBidCents });
        const softClose = decideSoftCloseExtension({
          endsAt: auction.endsAt,
          acceptedAt,
          windowSeconds: this.config.auctions.softCloseWindowSeconds,
          isPriceOrLeaderChanged: hasPriceOrLeaderChanged(before, after),
        });

        await this.bidHistoryRepository.append(auction.id, historyEntries, acceptedAt);
        await this.auctionRepository.updateBiddingState(auction.id, {
          currentPriceCents: after.priceCents,
          leaderUserId: after.leaderUserId,
          bidCount: auction.bidCount + historyEntries.length,
          endsAt: softClose.endsAt,
          extensionCount: auction.extensionCount + (softClose.isExtended ? 1 : 0),
        });

        return {
          outcome: {
            isLeading: after.leaderUserId === bidder.id,
            priceCents: after.priceCents,
            minimumNextBidCents: computeMinimumNextBidCents(state, after),
            endsAt: softClose.endsAt,
            isExtended: softClose.isExtended,
          },
          announcement: decideAuctionChangeAnnouncement(before, after, {
            auctionSlug: auction.slug,
            artworkTitle: artwork.artwork.title,
            endsAt: softClose.endsAt,
            isExtended: softClose.isExtended,
          }),
        };
      }),
    );

    this.announce(announcement);
    return outcome;
  }

  /**
   * Never throws: the bid is already committed, and failing the request now would tell the
   * bidder their bid was lost when it was not. Viewers catch up on their next refetch.
   */
  private announce(announcement: AuctionChangeAnnouncement): void {
    try {
      this.eventPublisher.publish(announcement);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not announce a committed bid on ${announcement.auctionChanged.slug}: ${reason}`);
    }
  }
}
