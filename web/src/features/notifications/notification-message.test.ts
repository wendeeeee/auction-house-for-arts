import { describe, expect, it } from 'vitest';
import type { NotificationView } from '../../shared/api/api-types';
import { describeNotification } from './notification-message';

function notification(overrides: Partial<NotificationView>): NotificationView {
  return {
    id: 'notification-1',
    kind: 'seller_auction_closed',
    auctionSlug: 'blue-hour-lot-1',
    artworkTitle: 'Blue Hour',
    outcome: 'sold',
    hammerPriceCents: 1_250_00,
    createdAt: '2026-01-15T13:00:00.000Z',
    readAt: null,
    ...overrides,
  };
}

describe('describeNotification', () => {
  it('tells the winner they won, and for how much', () => {
    expect(describeNotification(notification({ kind: 'bidder_auction_won' }))).toMatchObject({
      label: 'You won',
      headline: 'You won Blue Hour for $1,250',
      isPositive: true,
    });
  });

  it('tells the highest bidder the reserve was not reached', () => {
    expect(
      describeNotification(notification({ kind: 'bidder_reserve_not_met', outcome: 'reserve_not_met', hammerPriceCents: null })),
    ).toMatchObject({ label: 'Reserve not met', headline: 'Blue Hour did not sell', isPositive: false });
  });

  it('tells the seller about a sale with the hammer price', () => {
    expect(describeNotification(notification({}))).toMatchObject({
      label: 'Sold',
      headline: 'Blue Hour sold for $1,250',
      isPositive: true,
    });
  });

  it('tells the seller the reserve was not met', () => {
    expect(describeNotification(notification({ outcome: 'reserve_not_met', hammerPriceCents: null }))).toMatchObject({
      label: 'Reserve not met',
      headline: 'Blue Hour closed below your reserve',
      isPositive: false,
    });
  });

  it('tells the seller nobody bid', () => {
    expect(describeNotification(notification({ outcome: 'no_bids', hammerPriceCents: null }))).toMatchObject({
      label: 'No bids',
      headline: 'Blue Hour closed without bids',
      isPositive: false,
    });
  });
});
