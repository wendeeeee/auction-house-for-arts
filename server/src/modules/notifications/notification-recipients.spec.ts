import type { AuctionClosedPayload } from '../outbox';
import { decideNotificationRecipients } from './notification-recipients';

const SELLER = 'seller-id';
const WINNER = 'winner-id';
const BIDDER = 'bidder-id';

function closed(overrides: Partial<AuctionClosedPayload>): AuctionClosedPayload {
  return {
    auctionId: 'auction-id',
    auctionSlug: 'harbour-lot-1',
    artworkTitle: 'Harbour',
    sellerUserId: SELLER,
    outcome: 'no_bids',
    winningUserId: null,
    leadingBidderUserId: null,
    hammerPriceCents: null,
    closedAt: '2026-01-15T13:00:00.000Z',
    ...overrides,
  };
}

describe('decideNotificationRecipients', () => {
  it('sold: the seller hears the outcome and the winner hears they won', () => {
    expect(
      decideNotificationRecipients(
        closed({ outcome: 'sold', winningUserId: WINNER, leadingBidderUserId: WINNER, hammerPriceCents: 310_00 }),
      ),
    ).toEqual([
      { recipientUserId: SELLER, kind: 'seller_auction_closed' },
      { recipientUserId: WINNER, kind: 'bidder_auction_won' },
    ]);
  });

  it('reserve not met: the seller hears the outcome and the highest bidder hears the reserve was not reached', () => {
    expect(decideNotificationRecipients(closed({ outcome: 'reserve_not_met', leadingBidderUserId: BIDDER }))).toEqual([
      { recipientUserId: SELLER, kind: 'seller_auction_closed' },
      { recipientUserId: BIDDER, kind: 'bidder_reserve_not_met' },
    ]);
  });

  it('no bids: only the seller hears about it', () => {
    expect(decideNotificationRecipients(closed({ outcome: 'no_bids' }))).toEqual([
      { recipientUserId: SELLER, kind: 'seller_auction_closed' },
    ]);
  });
});
