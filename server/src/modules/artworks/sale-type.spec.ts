import { resolveSaleType } from './sale-type';

describe('resolveSaleType', () => {
  const artistUserId = '5eed0000-0000-4000-8000-000000000001';
  const collectorUserId = '5eed0000-0000-4000-8000-000000000005';

  it('is primary while the artist still owns the work', () => {
    expect(resolveSaleType(artistUserId, artistUserId)).toBe('primary');
  });

  it('is a resale once a collector owns it', () => {
    expect(resolveSaleType(collectorUserId, artistUserId)).toBe('resale');
  });
});
