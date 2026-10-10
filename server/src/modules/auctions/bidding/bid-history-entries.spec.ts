import { decideBidHistoryEntries, hasPriceOrLeaderChanged } from './bid-history-entries';
import { ProxyBidResolution } from './proxy-bid-resolution';

const noBids: ProxyBidResolution = { leaderUserId: null, leaderMaxCents: null, priceCents: 100_00 };
const adaLeadsAt310: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 500_00, priceCents: 310_00 };

describe('decideBidHistoryEntries', () => {
  it('records a first bid as placed, at the starting price', () => {
    const after: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 500_00, priceCents: 100_00 };

    expect(decideBidHistoryEntries(noBids, after, { bidderUserId: 'ada', maxBidCents: 500_00 })).toEqual([
      { bidderUserId: 'ada', amountCents: 100_00, kind: 'placed' },
    ]);
  });

  it('records taking the lead as one placed row at the new price, never at the new maximum', () => {
    const after: ProxyBidResolution = { leaderUserId: 'bianca', leaderMaxCents: 600_00, priceCents: 510_00 };

    expect(decideBidHistoryEntries(adaLeadsAt310, after, { bidderUserId: 'bianca', maxBidCents: 600_00 })).toEqual([
      { bidderUserId: 'bianca', amountCents: 510_00, kind: 'placed' },
    ]);
  });

  it('records an immediate outbid as the bid, then the leader’s automatic response', () => {
    const after: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 500_00, priceCents: 410_00 };

    expect(decideBidHistoryEntries(adaLeadsAt310, after, { bidderUserId: 'chidi', maxBidCents: 400_00 })).toEqual([
      { bidderUserId: 'chidi', amountCents: 400_00, kind: 'placed' },
      { bidderUserId: 'ada', amountCents: 410_00, kind: 'automatic' },
    ]);
  });

  it('records nothing when the leader raises their own maximum and the price stays', () => {
    const after: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 800_00, priceCents: 310_00 };

    expect(decideBidHistoryEntries(adaLeadsAt310, after, { bidderUserId: 'ada', maxBidCents: 800_00 })).toEqual([]);
  });

  it('records a leader’s self-raise that meets the reserve, because the price moves', () => {
    const after: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 1_000_00, priceCents: 900_00 };

    expect(decideBidHistoryEntries(adaLeadsAt310, after, { bidderUserId: 'ada', maxBidCents: 1_000_00 })).toEqual([
      { bidderUserId: 'ada', amountCents: 900_00, kind: 'placed' },
    ]);
  });
});

describe('hasPriceOrLeaderChanged', () => {
  it('is true for a price change or a leader change, false for neither', () => {
    expect(hasPriceOrLeaderChanged(adaLeadsAt310, { ...adaLeadsAt310, priceCents: 320_00 })).toBe(true);
    expect(hasPriceOrLeaderChanged(adaLeadsAt310, { ...adaLeadsAt310, leaderUserId: 'bianca' })).toBe(true);
    expect(hasPriceOrLeaderChanged(adaLeadsAt310, { ...adaLeadsAt310, leaderMaxCents: 900_00 })).toBe(false);
  });
});
