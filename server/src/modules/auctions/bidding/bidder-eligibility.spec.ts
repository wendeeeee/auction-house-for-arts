import { ErrorCode } from '../../../common/errors';
import { assertBidderIsEligible, decideBidderIneligibility } from './bidder-eligibility';

describe('bidder eligibility', () => {
  const collectorSale = { sellerUserId: 'bianca', ownerUserId: 'bianca' };

  it('lets anyone other than the seller and the owner bid', () => {
    expect(decideBidderIneligibility({ bidderUserId: 'chidi', ...collectorSale })).toBeNull();
    expect(() => assertBidderIsEligible({ bidderUserId: 'chidi', ...collectorSale })).not.toThrow();
  });

  it('lets the artist bid on a collector’s resale of their work', () => {
    // The artist is neither the seller nor the owner here, so nothing excludes them.
    expect(decideBidderIneligibility({ bidderUserId: 'amara_the_artist', ...collectorSale })).toBeNull();
  });

  it('blocks the seller', () => {
    expect(() => assertBidderIsEligible({ bidderUserId: 'bianca', ...collectorSale })).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_ALLOWED_TO_BID, httpStatus: 409, details: { reason: 'seller' } }),
    );
  });

  it('blocks the current owner even when they are not the seller', () => {
    expect(() => assertBidderIsEligible({ bidderUserId: 'ada', sellerUserId: 'bianca', ownerUserId: 'ada' })).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_ALLOWED_TO_BID, details: { reason: 'owner' } }),
    );
  });
});
