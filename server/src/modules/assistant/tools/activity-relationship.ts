import type { AuctionStatus } from '../../auctions';

export const ACTIVITY_RELATIONSHIPS = [
  'selling',
  'leading',
  'outbid',
  'awaiting_result',
  'won',
  'lost',
  'reserve_not_met',
] as const;
export type ActivityRelationship = (typeof ACTIVITY_RELATIONSHIPS)[number];

/**
 * The user's standing on one auction they sell or bid on. `awaiting_result`: ended, but the close
 * worker has not recorded the outcome yet. `reserve_not_met`: they led, but below the reserve.
 */
export function decideActivityRelationship(input: {
  readonly userId: string;
  readonly sellerUserId: string;
  readonly leaderUserId: string | null;
  readonly status: AuctionStatus;
  readonly close: { readonly outcome: 'sold' | 'reserve_not_met' | 'no_bids'; readonly winningUserId: string | null } | null;
}): ActivityRelationship {
  if (input.userId === input.sellerUserId) return 'selling';
  const isLeader = input.leaderUserId === input.userId;
  if (input.status === 'open') return isLeader ? 'leading' : 'outbid';
  if (input.close === null) return 'awaiting_result';
  if (input.close.outcome === 'sold' && input.close.winningUserId === input.userId) return 'won';
  if (input.close.outcome === 'reserve_not_met' && isLeader) return 'reserve_not_met';
  return 'lost';
}
