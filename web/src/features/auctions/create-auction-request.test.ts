import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/api/api-error';
import { buildCreateAuctionRequest, describeCreateAuctionError } from './create-auction-request';

const now = new Date('2026-03-01T12:00:00.000Z');
const base = { artworkSlug: 'desert-geometry', startingPriceText: '250', reservePriceText: '', durationSeconds: 3_600, now };

describe('buildCreateAuctionRequest', () => {
  it('builds the request in cents, ending the chosen duration from now, without a reserve when blank', () => {
    expect(buildCreateAuctionRequest(base)).toEqual({
      isValid: true,
      request: { artworkSlug: 'desert-geometry', startingPriceCents: 25000, endsAt: '2026-03-01T13:00:00.000Z' },
    });
  });

  it('includes a reserve when given', () => {
    const result = buildCreateAuctionRequest({ ...base, reservePriceText: '1,200.50' });
    expect(result).toMatchObject({ isValid: true, request: { reservePriceCents: 120050 } });
  });

  it.each([
    [{ startingPriceText: '' }, 'Enter a starting price in dollars, like 250.'],
    [{ startingPriceText: '0.99' }, 'The starting price must be at least $1.'],
    [{ reservePriceText: 'lots' }, 'Enter the reserve in dollars, or leave it blank.'],
    [{ reservePriceText: '249.99' }, 'The reserve must be at least the starting price.'],
  ])('rejects %j', (overrides, problem) => {
    expect(buildCreateAuctionRequest({ ...base, ...overrides })).toEqual({ isValid: false, problem });
  });
});

describe('describeCreateAuctionError', () => {
  const apiError = (code: string, details: Record<string, unknown> = {}) =>
    new ApiError(409, code, 'server message', details, null);

  it('explains the business-rule codes', () => {
    expect(describeCreateAuctionError(apiError('ARTWORK_ALREADY_AT_AUCTION'))).toContain('already has an auction');
    expect(describeCreateAuctionError(apiError('NOT_ARTWORK_OWNER'))).toContain('current owner');
  });

  it('lists field errors from a validation failure', () => {
    const error = apiError('VALIDATION_FAILED', {
      fieldErrors: [{ path: 'endsAt', message: 'must be at least 2 minutes from now' }],
    });
    expect(describeCreateAuctionError(error)).toBe('Please check: endsAt must be at least 2 minutes from now.');
  });
});
