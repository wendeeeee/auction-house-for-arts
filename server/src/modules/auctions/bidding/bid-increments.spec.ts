import { ErrorCode } from '../../../common/errors';
import { incrementForPriceCents } from './bid-increments';

describe('incrementForPriceCents', () => {
  // Upper bounds are inclusive: an exact $100.00 is still in the $5 tier, one cent more is not.
  it.each([
    [0, 5_00],
    [99_99, 5_00],
    [100_00, 5_00],
    [100_01, 10_00],
    [1_000_00, 10_00],
    [1_000_01, 50_00],
    [5_000_00, 50_00],
    [5_000_01, 100_00],
    [25_000_00, 100_00],
    [25_000_01, 250_00],
    [1_000_000_00, 250_00],
  ])('a price of %i cents steps by %i cents', (priceCents, incrementCents) => {
    expect(incrementForPriceCents(priceCents)).toBe(incrementCents);
  });

  it('rejects amounts that are not whole, non-negative cents', () => {
    expect(() => incrementForPriceCents(10.5)).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_AMOUNT }));
    expect(() => incrementForPriceCents(-1)).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_AMOUNT }));
  });
});
