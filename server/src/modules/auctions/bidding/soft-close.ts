import { InvariantViolationError } from '../../../common/errors';

export interface SoftCloseInput {
  readonly endsAt: Date;
  /** When the bid was accepted: the clock read after the auction row lock was taken. */
  readonly acceptedAt: Date;
  readonly windowSeconds: number;
  /** Only a visible change extends; a leader's silent self-raise must not keep an auction open forever. */
  readonly isPriceOrLeaderChanged: boolean;
}

export interface SoftCloseDecision {
  readonly endsAt: Date;
  readonly isExtended: boolean;
}

/**
 * Anti-sniping. A visible change with less than the window left pushes the end out to
 * `acceptedAt + window`, so every other bidder always gets a full window to respond. Measured
 * from the bid rather than added to the old end, so repeated late bids extend by at most the
 * window each time.
 */
export function decideSoftCloseExtension(input: SoftCloseInput): SoftCloseDecision {
  const remainingMilliseconds = input.endsAt.getTime() - input.acceptedAt.getTime();
  if (remainingMilliseconds <= 0) {
    // The caller rejects bids on ended auctions before this point.
    throw new InvariantViolationError('A soft close was considered for a bid after the auction ended.', {
      endsAt: input.endsAt.toISOString(),
      acceptedAt: input.acceptedAt.toISOString(),
    });
  }

  const windowMilliseconds = input.windowSeconds * 1_000;
  if (!input.isPriceOrLeaderChanged || remainingMilliseconds >= windowMilliseconds) {
    return { endsAt: input.endsAt, isExtended: false };
  }
  return { endsAt: new Date(input.acceptedAt.getTime() + windowMilliseconds), isExtended: true };
}
