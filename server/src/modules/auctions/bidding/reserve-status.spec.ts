import { MaximumBid } from '../auctions.types';
import { resolveProxyBids } from './proxy-bid-resolution';
import { decideReserveStatus, decideReserveStatusOfAuction } from './reserve-status';

describe('decideReserveStatus', () => {
  it.each([
    ['no reserve, no bids', null, null, 'none'],
    ['no reserve, with a leader', null, 500_00, 'none'],
    ['a reserve and no bids', 400_00, null, 'not_met'],
    ['a leading maximum below the reserve', 400_00, 399_99, 'not_met'],
    ['a leading maximum exactly at the reserve', 400_00, 400_00, 'met'],
    ['a leading maximum above the reserve', 400_00, 900_00, 'met'],
  ] as const)('%s: %s', (_case, reservePriceCents, leaderMaxCents, expected) => {
    expect(decideReserveStatus(reservePriceCents, leaderMaxCents)).toBe(expected);
  });
});

describe('decideReserveStatusOfAuction', () => {
  const bid = (bidderUserId: string, maxCents: number, placementSequence: number): MaximumBid => ({
    bidderUserId,
    maxCents,
    placementSequence,
  });

  // Each case: the stored row (price, leader) must give the same status as the leader's maximum would.
  it.each([
    ['no bids', 400_00, []],
    ['one bid below the reserve', 400_00, [bid('ada', 399_99, 1)]],
    ['one bid at the reserve', 400_00, [bid('ada', 400_00, 1)]],
    ['one bid above the reserve', 400_00, [bid('ada', 900_00, 1)]],
    ['two bids, leader below the reserve', 1_000_00, [bid('ada', 500_00, 1), bid('bianca', 300_00, 2)]],
    ['two bids, leader just above the reserve', 400_00, [bid('bianca', 395_00, 1), bid('ada', 402_00, 2)]],
    ['two bids, runner-up far below the reserve', 500_00, [bid('ada', 600_00, 1), bid('bianca', 300_00, 2)]],
    ['a tie at the reserve', 400_00, [bid('ada', 400_00, 1), bid('bianca', 400_00, 2)]],
    ['no reserve', null, [bid('ada', 600_00, 1)]],
  ] as const)('agrees with the leader’s maximum: %s', (_case, reservePriceCents, maximumBids) => {
    const resolution = resolveProxyBids({ startingPriceCents: 100_00, reservePriceCents, maximumBids });

    expect(
      decideReserveStatusOfAuction({
        reservePriceCents,
        leaderUserId: resolution.leaderUserId,
        currentPriceCents: resolution.priceCents,
      }),
    ).toBe(decideReserveStatus(reservePriceCents, resolution.leaderMaxCents));
  });
});
