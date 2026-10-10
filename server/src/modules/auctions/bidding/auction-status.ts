import { AuctionEndedError } from '../auctions.errors';
import { AuctionStatus } from '../auctions.types';

export interface AuctionTiming {
  readonly endsAt: Date;
  readonly closedAt: Date | null;
}

/**
 * Ended at or after `ends_at`, from the injected clock. A closed auction is ended whatever its
 * `ends_at` says: defensive, so a close (phase 4) can never be reopened by a clock or data error.
 */
export function decideAuctionStatus(timing: AuctionTiming, now: Date): AuctionStatus {
  if (timing.closedAt !== null) return 'ended';
  return now.getTime() >= timing.endsAt.getTime() ? 'ended' : 'open';
}

/** Call with the clock read after the auction row lock, so a concurrent extension is already visible. */
export function assertAuctionIsOpen(timing: AuctionTiming, now: Date): void {
  if (decideAuctionStatus(timing, now) === 'ended') {
    throw new AuctionEndedError({ endsAt: timing.endsAt.toISOString() });
  }
}
