import { decideCheckoutViewerRole } from './checkout-access';

describe('decideCheckoutViewerRole', () => {
  const parties = { winningUserId: 'winner', sellerUserId: 'seller' };

  it('the winner is the buyer', () => {
    expect(decideCheckoutViewerRole({ ...parties, viewerUserId: 'winner' })).toBe('buyer');
  });

  it('the seller gets the seller view', () => {
    expect(decideCheckoutViewerRole({ ...parties, viewerUserId: 'seller' })).toBe('seller');
  });

  it('anyone else, including a losing bidder, gets nothing', () => {
    expect(decideCheckoutViewerRole({ ...parties, viewerUserId: 'someone-else' })).toBe('none');
  });
});
