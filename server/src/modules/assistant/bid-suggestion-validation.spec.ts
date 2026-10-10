import { decideBidSuggestionRejection } from './bid-suggestion-validation';

const openAuction = {
  status: 'open' as const,
  youMayBid: true,
  youAreLeading: false,
  yourMaxBidCents: null,
  minimumNextBidCents: 1_050_00,
};

describe('decideBidSuggestionRejection', () => {
  it('accepts a suggestion at or above the live minimum next bid', () => {
    expect(decideBidSuggestionRejection({ wasSeenInSession: true, auction: openAuction, amountCents: 1_050_00 })).toBeNull();
    expect(decideBidSuggestionRejection({ wasSeenInSession: true, auction: openAuction, amountCents: 2_000_00 })).toBeNull();
  });

  it('rejects one cent below the minimum', () => {
    expect(decideBidSuggestionRejection({ wasSeenInSession: true, auction: openAuction, amountCents: 1_049_99 })).toBe('below_minimum');
  });

  it('rejects auctions no tool returned, missing auctions, and ended auctions', () => {
    expect(decideBidSuggestionRejection({ wasSeenInSession: false, auction: openAuction, amountCents: 2_000_00 })).toBe('unseen_auction');
    expect(decideBidSuggestionRejection({ wasSeenInSession: true, auction: null, amountCents: 2_000_00 })).toBe('auction_not_found');
    expect(
      decideBidSuggestionRejection({ wasSeenInSession: true, auction: { ...openAuction, status: 'ended' }, amountCents: 2_000_00 }),
    ).toBe('auction_ended');
  });

  it('rejects the seller or owner, who may not bid at all', () => {
    expect(
      decideBidSuggestionRejection({ wasSeenInSession: true, auction: { ...openAuction, youMayBid: false }, amountCents: 2_000_00 }),
    ).toBe('not_allowed_to_bid');
  });

  it('holds the leader to raising above their own maximum, not to the minimum', () => {
    const leading = { ...openAuction, youAreLeading: true, yourMaxBidCents: 1_500_00 };
    expect(decideBidSuggestionRejection({ wasSeenInSession: true, auction: leading, amountCents: 1_500_00 })).toBe('not_above_your_maximum');
    expect(decideBidSuggestionRejection({ wasSeenInSession: true, auction: leading, amountCents: 1_500_01 })).toBeNull();
  });
});
