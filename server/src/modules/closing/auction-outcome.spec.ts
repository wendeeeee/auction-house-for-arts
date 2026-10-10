import type { MaximumBid, ProxyBidState } from '../auctions';
import { decideAuctionOutcome } from './auction-outcome';

const dollars = (amount: number): number => Math.round(amount * 100);

/** Bids in placement order: the first listed was placed first. */
function placed(...bids: readonly [bidderUserId: string, maxDollars: number][]): MaximumBid[] {
  return bids.map(([bidderUserId, maxDollars], index) => ({
    bidderUserId,
    maxCents: dollars(maxDollars),
    placementSequence: index + 1,
  }));
}

function auction(overrides: { reserveDollars?: number; bids?: MaximumBid[] } = {}): ProxyBidState {
  return {
    startingPriceCents: dollars(100),
    reservePriceCents: overrides.reserveDollars === undefined ? null : dollars(overrides.reserveDollars),
    maximumBids: overrides.bids ?? [],
  };
}

describe('decideAuctionOutcome', () => {
  it('no bids: nothing sells, and there is no one to tell but the seller', () => {
    expect(decideAuctionOutcome(auction({ reserveDollars: 500 }))).toEqual({
      outcome: 'no_bids',
      winningUserId: null,
      hammerPriceCents: null,
      leadingBidderUserId: null,
    });
  });

  it('sold without a reserve: the leader wins at the visible price, not at their maximum', () => {
    // ada leads; the price is just enough to beat ben's 300 (increment 10 at that tier).
    expect(decideAuctionOutcome(auction({ bids: placed(['ada', 900], ['ben', 300]) }))).toEqual({
      outcome: 'sold',
      winningUserId: 'ada',
      hammerPriceCents: dollars(310),
      leadingBidderUserId: 'ada',
    });
  });

  it('sold to a single bidder without a reserve at the starting price', () => {
    expect(decideAuctionOutcome(auction({ bids: placed(['ada', 900]) }))).toMatchObject({
      outcome: 'sold',
      winningUserId: 'ada',
      hammerPriceCents: dollars(100),
    });
  });

  it('sold with a reserve met by a single bidder: the price is lifted to the reserve', () => {
    expect(decideAuctionOutcome(auction({ reserveDollars: 600, bids: placed(['ada', 900]) }))).toMatchObject({
      outcome: 'sold',
      winningUserId: 'ada',
      hammerPriceCents: dollars(600),
    });
  });

  it('a maximum exactly at the reserve meets it, and sells at the reserve', () => {
    expect(decideAuctionOutcome(auction({ reserveDollars: 600, bids: placed(['ada', 600], ['ben', 200]) }))).toEqual({
      outcome: 'sold',
      winningUserId: 'ada',
      hammerPriceCents: dollars(600),
      leadingBidderUserId: 'ada',
    });
  });

  it('reserve not met: no winner and no price, but the leader is named so they can be told', () => {
    expect(decideAuctionOutcome(auction({ reserveDollars: 600, bids: placed(['ada', 599], ['ben', 200]) }))).toEqual({
      outcome: 'reserve_not_met',
      winningUserId: null,
      hammerPriceCents: null,
      leadingBidderUserId: 'ada',
    });
  });

  it('between equal maximums, the earlier placement wins', () => {
    expect(decideAuctionOutcome(auction({ bids: placed(['ada', 500], ['ben', 500]) }))).toMatchObject({
      outcome: 'sold',
      winningUserId: 'ada',
      hammerPriceCents: dollars(500),
    });
  });
});
