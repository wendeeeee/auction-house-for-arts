import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/api/api-error';
import { describeBidOutcome, describeBidRejection } from './bid-outcome-message';

const accepted = { priceCents: 31000, minimumNextBidCents: 32000, endsAt: '2026-03-01T18:00:00.000Z' };

describe('describeBidOutcome', () => {
  it('tells a new leader the price they lead at', () => {
    const message = describeBidOutcome({ ...accepted, leading: true, extended: false });
    expect(message.tone).toBe('success');
    expect(message.title).toBe('You’re the highest bidder at $310.');
    expect(message.detail).not.toContain('extended');
  });

  it('treats being outbid at once as a warning with the next minimum, not an error', () => {
    const message = describeBidOutcome({ ...accepted, leading: false, extended: false });
    expect(message.tone).toBe('warning');
    expect(message.detail).toBe('Your bid raised the price to $310. Bid $320 or more to try again.');
  });

  it('mentions a soft-close extension in either case', () => {
    expect(describeBidOutcome({ ...accepted, leading: true, extended: true }).detail).toContain('extended');
    expect(describeBidOutcome({ ...accepted, leading: false, extended: true }).detail).toContain('extended');
  });
});

describe('describeBidRejection', () => {
  const apiError = (code: string, details: Record<string, unknown> = {}) =>
    new ApiError(409, code, 'server message', details, 'request-1');

  it.each([
    ['BID_TOO_LOW', { maxBidCents: 10499, minimumNextBidCents: 10500 }, 'Enter $105 or more.'],
    ['MAX_NOT_RAISED', { maxBidCents: 50000, yourMaxBidCents: 50000 }, 'To raise your maximum, enter more than $500.'],
    ['AUCTION_ENDED', {}, 'Bids are no longer accepted.'],
    ['NOT_ALLOWED_TO_BID', { reason: 'seller' }, 'You are the seller.'],
    ['NOT_ALLOWED_TO_BID', { reason: 'owner' }, 'You own this artwork.'],
  ])('%s explains itself from its details', (code, details, detail) => {
    expect(describeBidRejection(apiError(code, details))).toMatchObject({ tone: 'error', detail });
  });

  it('falls back to the server message for an unknown code', () => {
    expect(describeBidRejection(apiError('SOMETHING_NEW')).detail).toBe('server message');
  });
});
