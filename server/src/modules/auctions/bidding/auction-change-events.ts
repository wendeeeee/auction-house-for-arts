import type { AuctionChangeAnnouncement } from '../../realtime';
import type { ProxyBidResolution } from './proxy-bid-resolution';

export interface AcceptedBidContext {
  readonly auctionSlug: string;
  readonly artworkTitle: string;
  /** After any soft-close extension. */
  readonly endsAt: Date;
  readonly isExtended: boolean;
}

/**
 * What an accepted bid announces, decided from the state before and after it.
 *
 * - Always exactly one `auction:changed`, even for a self-raise that changes nothing public:
 *   the event only asks viewers to refetch, and the bidder's other tabs show the new maximum.
 * - `user:outbid` goes to the previous leader only when the leader changed. So a first bid
 *   (no previous leader), a leader's self-raise, and a bid that an existing maximum beats at
 *   once (the leader stays) alert no one.
 */
export function decideAuctionChangeAnnouncement(
  before: ProxyBidResolution,
  after: ProxyBidResolution,
  context: AcceptedBidContext,
): AuctionChangeAnnouncement {
  const previousLeaderUserId = before.leaderUserId;
  const isLeaderReplaced = previousLeaderUserId !== null && previousLeaderUserId !== after.leaderUserId;

  return {
    auctionChanged: {
      slug: context.auctionSlug,
      priceCents: after.priceCents,
      endsAt: context.endsAt.toISOString(),
      extended: context.isExtended,
    },
    userOutbid: isLeaderReplaced
      ? {
          userId: previousLeaderUserId,
          event: { slug: context.auctionSlug, artworkTitle: context.artworkTitle, priceCents: after.priceCents },
        }
      : null,
  };
}
