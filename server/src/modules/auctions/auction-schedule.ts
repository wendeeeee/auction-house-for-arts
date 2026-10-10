/** Short enough to demo a whole auction, soft close included. */
export const MINIMUM_AUCTION_DURATION_SECONDS = 2 * 60;
export const MAXIMUM_AUCTION_DURATION_SECONDS = 14 * 24 * 60 * 60;

/**
 * Why `endsAt` cannot be the end of a new auction, or null if it can. Both bounds are
 * inclusive. Pure: `now` comes from the injected clock.
 */
export function decideAuctionEndProblem(endsAt: Date, now: Date): string | null {
  const durationSeconds = (endsAt.getTime() - now.getTime()) / 1_000;
  if (durationSeconds < MINIMUM_AUCTION_DURATION_SECONDS) return 'must be at least 2 minutes from now';
  if (durationSeconds > MAXIMUM_AUCTION_DURATION_SECONDS) return 'must be at most 14 days from now';
  return null;
}
