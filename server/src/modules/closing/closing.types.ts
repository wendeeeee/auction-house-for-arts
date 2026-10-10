import type { AuctionOutcome } from '../outbox';

export { AUCTION_OUTCOMES } from '../outbox';
export type { AuctionOutcome } from '../outbox';

export interface AuctionClose {
  readonly auctionId: string;
  readonly outcome: AuctionOutcome;
  readonly winningUserId: string | null;
  readonly hammerPriceCents: number | null;
  readonly closedAt: Date;
}

/** `not_due`: extended after it was selected. `skipped`: already closed, or locked elsewhere. */
export type CloseAttemptResult = 'closed' | 'not_due' | 'skipped';

export interface CloseDueAuctionsSummary {
  readonly closed: number;
  readonly notDue: number;
  readonly skipped: number;
  readonly failed: number;
}
