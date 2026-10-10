import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser } from '../../common/identity';
import { withSpan } from '../../common/tracing';
import { UnitOfWork } from '../../database';
import { ArtworkCatalogService } from '../artworks';
import { Auction, AuctionClosingService, AuctionNotFoundError } from '../auctions';
import { OutboxService } from '../outbox';
import { AUCTION_CLOSED_EVENT, AuctionClosedEvent, REALTIME_EMITTER, RealtimeEmitter } from '../realtime';
import { UsersService } from '../users';
import { AuctionCloseRepository } from './auction-close.repository';
import { AuctionOutcomeDecision, decideAuctionOutcome } from './auction-outcome';
import { AuctionClose, AuctionResult, CloseAttemptResult, CloseDueAuctionsSummary } from './closing.types';

const CLOSE_BATCH_SIZE = 50;

export interface AuctionOutcomeDetails {
  readonly close: AuctionClose | null;
  readonly winnerHandle: string | null;
  readonly viewerUserId: string | null;
}

interface CommittedClose {
  readonly result: CloseAttemptResult;
  readonly auctionSlug: string | null;
}

/**
 * Select due auctions without a lock, then close each in its own transaction under the bidding
 * lock, re-checking `ends_at` after locking. See ADR 0003.
 */
@Injectable()
export class AuctionCloseService {
  private readonly logger = new Logger(AuctionCloseService.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly auctionClosing: AuctionClosingService,
    private readonly artworkCatalog: ArtworkCatalogService,
    private readonly auctionCloseRepository: AuctionCloseRepository,
    private readonly outboxService: OutboxService,
    private readonly usersService: UsersService,
    private readonly clock: Clock,
    @Inject(REALTIME_EMITTER) private readonly realtimeEmitter: RealtimeEmitter,
  ) {}

  async closeDueAuctions(): Promise<CloseDueAuctionsSummary> {
    const dueAuctionIds = await this.auctionClosing.findDueAuctionIds(this.clock.now(), CLOSE_BATCH_SIZE);
    const summary = { closed: 0, notDue: 0, skipped: 0, failed: 0 };
    for (const auctionId of dueAuctionIds) {
      try {
        const result = await this.closeAuctionIfDue(auctionId);
        if (result === 'closed') summary.closed += 1;
        else if (result === 'not_due') summary.notDue += 1;
        else summary.skipped += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.error(`Could not close auction ${auctionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return summary;
  }

  async closeAuctionIfDue(auctionId: string): Promise<CloseAttemptResult> {
    if (this.unitOfWork.isInTransaction) {
      throw new InvariantViolationError('closeAuctionIfDue must own its transaction, so it can announce after commit.');
    }
    const committed = await withSpan('closing.close_auction', { 'auction.id': auctionId }, () =>
      this.unitOfWork.run(async (): Promise<CommittedClose> => {
        const auction = await this.auctionClosing.lockUnclosedAuctionForClosing(auctionId);
        if (!auction) return { result: 'skipped', auctionSlug: null };

        // A bid that held the lock may have extended the auction since it was selected.
        const closedAt = this.clock.now();
        if (auction.endsAt.getTime() > closedAt.getTime()) return { result: 'not_due', auctionSlug: null };

        const decision = decideAuctionOutcome({
          startingPriceCents: auction.startingPriceCents,
          reservePriceCents: auction.reservePriceCents,
          maximumBids: await this.auctionClosing.listMaximumBids(auction.id),
        });
        assertDecisionMatchesVisibleState(auction, decision);

        const [artwork] = await this.artworkCatalog.findArtworksByIds([auction.artworkId]);
        if (!artwork) {
          throw new InvariantViolationError('An auction references a missing artwork.', { auctionId: auction.id });
        }

        await this.auctionCloseRepository.insert({
          auctionId: auction.id,
          outcome: decision.outcome,
          winningUserId: decision.winningUserId,
          hammerPriceCents: decision.hammerPriceCents,
          closedAt,
        });
        await this.auctionClosing.markAuctionClosed(auction.id, closedAt);
        await this.outboxService.recordEvent('AuctionClosed', {
          auctionId: auction.id,
          auctionSlug: auction.slug,
          artworkTitle: artwork.artwork.title,
          sellerUserId: auction.sellerUserId,
          outcome: decision.outcome,
          winningUserId: decision.winningUserId,
          leadingBidderUserId: decision.leadingBidderUserId,
          hammerPriceCents: decision.hammerPriceCents,
          closedAt: closedAt.toISOString(),
        });
        return { result: 'closed', auctionSlug: auction.slug };
      }),
    );

    if (committed.auctionSlug !== null) this.announceClosed(committed.auctionSlug);
    return committed.result;
  }

  async getOutcome(auctionSlug: string, viewer: AuthenticatedUser | null): Promise<AuctionOutcomeDetails> {
    const auction = await this.auctionClosing.findAuctionBySlug(auctionSlug);
    if (!auction) throw new AuctionNotFoundError(auctionSlug);
    const close = await this.auctionCloseRepository.findByAuctionId(auction.id);
    let winnerHandle: string | null = null;
    if (close?.winningUserId) {
      const [winner] = await this.usersService.findUsersByIds([close.winningUserId]);
      if (!winner) throw new InvariantViolationError('An auction close references an unknown user.', { auctionId: auction.id });
      winnerHandle = winner.handle;
    }
    return { close, winnerHandle, viewerUserId: viewer?.id ?? null };
  }

  async getAuctionResultBySlug(auctionSlug: string): Promise<AuctionResult> {
    const auction = await this.auctionClosing.findAuctionBySlug(auctionSlug);
    if (!auction) throw new AuctionNotFoundError(auctionSlug);
    return this.toAuctionResult(auction);
  }

  async getAuctionResultById(auctionId: string): Promise<AuctionResult> {
    const auction = await this.auctionClosing.findAuctionById(auctionId);
    if (!auction) throw new InvariantViolationError('No auction with this ID.', { auctionId });
    return this.toAuctionResult(auction);
  }

  private async toAuctionResult(auction: Auction): Promise<AuctionResult> {
    return {
      auctionId: auction.id,
      auctionSlug: auction.slug,
      artworkId: auction.artworkId,
      sellerUserId: auction.sellerUserId,
      close: await this.auctionCloseRepository.findByAuctionId(auction.id),
    };
  }

  /** Best effort, after commit (ADR 0002). */
  private announceClosed(auctionSlug: string): void {
    try {
      const event: AuctionClosedEvent = { slug: auctionSlug };
      this.realtimeEmitter.emitToAuction(auctionSlug, AUCTION_CLOSED_EVENT, event);
    } catch (error) {
      this.logger.error(`Could not announce the close of ${auctionSlug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** Never close at a price or to a leader that bidders were not shown. */
function assertDecisionMatchesVisibleState(auction: Auction, decision: AuctionOutcomeDecision): void {
  const isLeaderConsistent = decision.leadingBidderUserId === auction.leaderUserId;
  const isPriceConsistent = decision.hammerPriceCents === null || decision.hammerPriceCents === auction.currentPriceCents;
  if (!isLeaderConsistent || !isPriceConsistent) {
    throw new InvariantViolationError('The closing outcome disagrees with the stored bidding state.', {
      auctionId: auction.id,
      storedLeaderUserId: auction.leaderUserId,
      storedPriceCents: auction.currentPriceCents,
      decidedLeaderUserId: decision.leadingBidderUserId,
      decidedHammerPriceCents: decision.hammerPriceCents,
    });
  }
}
