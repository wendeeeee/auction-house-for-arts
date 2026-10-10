import { ErrorCode } from '../../../common/errors';
import { MaximumBid } from '../auctions.types';
import {
  ProxyBidState,
  assertMaximumBidIsAcceptable,
  computeMinimumNextBidCents,
  replaceMaximumBid,
  resolveProxyBids,
} from './proxy-bid-resolution';

/** Whole dollars to cents, so the tables read like the rules. */
const dollars = (amount: number): number => Math.round(amount * 100);

/** Bids in placement order: the first listed was placed first. */
function placed(...bids: readonly [bidderUserId: string, maxDollars: number][]): MaximumBid[] {
  return bids.map(([bidderUserId, maxDollars], index) => ({
    bidderUserId,
    maxCents: dollars(maxDollars),
    placementSequence: index + 1,
  }));
}

function auction(overrides: { startingDollars?: number; reserveDollars?: number; bids?: MaximumBid[] } = {}): ProxyBidState {
  return {
    startingPriceCents: dollars(overrides.startingDollars ?? 100),
    reservePriceCents: overrides.reserveDollars === undefined ? null : dollars(overrides.reserveDollars),
    maximumBids: overrides.bids ?? [],
  };
}

describe('resolveProxyBids', () => {
  describe.each<{ name: string; state: ProxyBidState; leader: string | null; priceDollars: number }>([
    { name: 'no bids: the starting price, no leader', state: auction(), leader: null, priceDollars: 100 },
    {
      name: 'the first bid sets the price to the starting price',
      state: auction({ bids: placed(['ada', 500]) }),
      leader: 'ada',
      priceDollars: 100,
    },
    {
      name: 'A max $500 and B max $300: $310, A leads',
      state: auction({ bids: placed(['ada', 500], ['bianca', 300]) }),
      leader: 'ada',
      priceDollars: 310,
    },
    {
      name: 'B raises to $600: $510, B leads',
      state: auction({ bids: placed(['ada', 500], ['bianca', 600]) }),
      leader: 'bianca',
      priceDollars: 510,
    },
    {
      name: 'equal maximums: the earlier one leads, at the maximum',
      state: auction({ bids: placed(['ada', 400], ['bianca', 400]) }),
      leader: 'ada',
      priceDollars: 400,
    },
    {
      name: 'the price never exceeds the leader’s maximum',
      state: auction({ bids: placed(['ada', 305], ['bianca', 300]) }),
      leader: 'ada',
      priceDollars: 305,
    },
    {
      name: 'increment boundary: a $995 runner-up steps by $10 into the $1,000 tier',
      state: auction({ bids: placed(['ada', 2_000], ['bianca', 995]) }),
      leader: 'ada',
      priceDollars: 1_005,
    },
    {
      name: 'a runner-up at exactly $1,000 still steps by $10 (tier bounds are inclusive)',
      state: auction({ bids: placed(['ada', 2_000], ['bianca', 1_000]) }),
      leader: 'ada',
      priceDollars: 1_010,
    },
    {
      name: 'a runner-up at $1,000.01 steps by $50',
      state: auction({ bids: placed(['ada', 2_000], ['bianca', 1_000.01]) }),
      leader: 'ada',
      priceDollars: 1_050.01,
    },
    {
      name: 'reserve not met: the normal rule applies',
      state: auction({ reserveDollars: 1_000, bids: placed(['ada', 500], ['bianca', 300]) }),
      leader: 'ada',
      priceDollars: 310,
    },
    {
      name: 'reserve met by a single bidder: the price jumps to the reserve',
      state: auction({ reserveDollars: 400, bids: placed(['ada', 450]) }),
      leader: 'ada',
      priceDollars: 400,
    },
    {
      name: 'reserve met exactly by the leader’s maximum',
      state: auction({ reserveDollars: 450, bids: placed(['ada', 450]) }),
      leader: 'ada',
      priceDollars: 450,
    },
    {
      name: 'reserve met, runner-up far below: the price is lifted from $310 to the reserve',
      state: auction({ reserveDollars: 500, bids: placed(['ada', 600], ['bianca', 300]) }),
      leader: 'ada',
      priceDollars: 500,
    },
    {
      name: 'leader max between the reserve and runner-up + increment: the price is the leader’s max',
      // $395 + $10 = $405 would exceed Ada's $402, and $402 is already above the $400 reserve.
      state: auction({ reserveDollars: 400, bids: placed(['bianca', 395], ['ada', 402]) }),
      leader: 'ada',
      priceDollars: 402,
    },
  ])('$name', ({ state, leader, priceDollars }) => {
    it(`leader ${String(leader)} at $${priceDollars}`, () => {
      const resolution = resolveProxyBids(state);
      expect(resolution.leaderUserId).toBe(leader);
      expect(resolution.priceCents).toBe(dollars(priceDollars));
    });
  });

  it('a leader raising their own maximum leaves the price and the leader unchanged', () => {
    const before = resolveProxyBids(auction({ bids: placed(['ada', 500], ['bianca', 300]) }));
    const afterRaise = resolveProxyBids(
      auction({ bids: [...placed(['bianca', 300]), { bidderUserId: 'ada', maxCents: dollars(800), placementSequence: 3 }] }),
    );

    expect(afterRaise.priceCents).toBe(before.priceCents);
    expect(afterRaise.leaderUserId).toBe('ada');
    expect(afterRaise.leaderMaxCents).toBe(dollars(800));
  });

  it('a raise to equal the leader loses the tie, because the leader committed to that amount first', () => {
    // Bianca bid first, Ada outbid her, then Bianca raised to Ada's maximum.
    const bids: MaximumBid[] = [
      { bidderUserId: 'ada', maxCents: dollars(500), placementSequence: 2 },
      { bidderUserId: 'bianca', maxCents: dollars(500), placementSequence: 3 },
    ];
    expect(resolveProxyBids(auction({ bids }))).toEqual({
      leaderUserId: 'ada',
      leaderMaxCents: dollars(500),
      priceCents: dollars(500),
    });
  });

  it('does not depend on the order the maximums are listed in', () => {
    const bids = placed(['ada', 700], ['bianca', 300], ['chidi', 650], ['dmitri', 700]);
    const expected = resolveProxyBids(auction({ bids }));

    expect(resolveProxyBids(auction({ bids: [...bids].reverse() }))).toEqual(expected);
    expect(expected).toEqual({ leaderUserId: 'ada', leaderMaxCents: dollars(700), priceCents: dollars(700) });
  });

  it('refuses two maximums from the same bidder', () => {
    const bids = [...placed(['ada', 500]), ...placed(['ada', 600])];
    expect(() => resolveProxyBids(auction({ bids }))).toThrow(
      expect.objectContaining({ code: ErrorCode.INVARIANT_VIOLATION }),
    );
  });
});

describe('computeMinimumNextBidCents', () => {
  function minimumNextBidDollars(state: ProxyBidState): number {
    return computeMinimumNextBidCents(state, resolveProxyBids(state)) / 100;
  }

  it('is the starting price when there are no bids', () => {
    expect(minimumNextBidDollars(auction({ startingDollars: 250 }))).toBe(250);
  });

  it('is one increment above the price once there is a bid', () => {
    // $100.00 is the top of the $5 tier.
    expect(minimumNextBidDollars(auction({ bids: placed(['ada', 500]) }))).toBe(105);
    expect(minimumNextBidDollars(auction({ bids: placed(['ada', 500], ['bianca', 300]) }))).toBe(320);
  });

  it('uses the tier of the price, not of the bid: $1,005 steps by $50', () => {
    expect(minimumNextBidDollars(auction({ bids: placed(['ada', 2_000], ['bianca', 995]) }))).toBe(1_055);
  });

  it('starts from the reserve once the price has jumped to it', () => {
    expect(minimumNextBidDollars(auction({ reserveDollars: 400, bids: placed(['ada', 450]) }))).toBe(410);
  });
});

describe('assertMaximumBidIsAcceptable', () => {
  const contested = auction({ bids: placed(['ada', 500], ['bianca', 300]) }); // $310, Ada leads

  function check(state: ProxyBidState, bidderUserId: string, maxDollars: number): void {
    assertMaximumBidIsAcceptable(state, resolveProxyBids(state), { bidderUserId, maxBidCents: dollars(maxDollars) });
  }

  it('accepts a first bid at exactly the starting price, and rejects one below it', () => {
    expect(() => check(auction(), 'ada', 100)).not.toThrow();
    expect(() => check(auction(), 'ada', 99.99)).toThrow(
      expect.objectContaining({
        code: ErrorCode.BID_TOO_LOW,
        details: { maxBidCents: dollars(99.99), minimumNextBidCents: dollars(100) },
      }),
    );
  });

  it('holds a new bidder to the minimum next bid', () => {
    expect(() => check(contested, 'chidi', 320)).not.toThrow();
    expect(() => check(contested, 'chidi', 319.99)).toThrow(expect.objectContaining({ code: ErrorCode.BID_TOO_LOW }));
  });

  it('holds an outbid bidder raising their own maximum to the minimum next bid too', () => {
    expect(() => check(contested, 'bianca', 315)).toThrow(expect.objectContaining({ code: ErrorCode.BID_TOO_LOW }));
    expect(() => check(contested, 'bianca', 320)).not.toThrow();
  });

  it('lets the leader raise to any amount above their maximum, even below the minimum next bid of others', () => {
    const closeRace = auction({ bids: placed(['ada', 305], ['bianca', 300]) }); // $305, minimum next $315
    expect(() => check(closeRace, 'ada', 305.01)).not.toThrow();
  });

  it('rejects a leader "raise" that is not above their current maximum', () => {
    expect(() => check(contested, 'ada', 500)).toThrow(
      expect.objectContaining({
        code: ErrorCode.MAX_NOT_RAISED,
        details: { maxBidCents: dollars(500), yourMaxBidCents: dollars(500) },
      }),
    );
    expect(() => check(contested, 'ada', 450)).toThrow(expect.objectContaining({ code: ErrorCode.MAX_NOT_RAISED }));
  });
});

describe('replaceMaximumBid', () => {
  it('replaces the bidder’s previous maximum and keeps the others', () => {
    const bids = placed(['ada', 500], ['bianca', 300]);
    const raised: MaximumBid = { bidderUserId: 'bianca', maxCents: dollars(600), placementSequence: 9 };

    expect(replaceMaximumBid(bids, raised)).toEqual([bids[0], raised]);
  });

  it('adds a first maximum', () => {
    const first: MaximumBid = { bidderUserId: 'ada', maxCents: dollars(500), placementSequence: 1 };
    expect(replaceMaximumBid([], first)).toEqual([first]);
  });
});
