import { ErrorCode } from '../errors';
import { MONEY_ROUNDING_MODE, RoundingMode, computeBasisPointShareCents } from './basis-points';

const { DOWN, HALF_UP, HALF_EVEN } = RoundingMode;

describe('computeBasisPointShareCents', () => {
  it.each([
    // amount, bps, mode, expected: exact share in the comment
    [10_000, 500, HALF_EVEN, 500], // 500.00
    [12_345, 500, DOWN, 617], // 617.25
    [12_345, 500, HALF_UP, 617], // 617.25
    [12_345, 500, HALF_EVEN, 617], // 617.25
    [12_355, 500, DOWN, 617], // 617.75
    [12_355, 500, HALF_UP, 618], // 617.75
    [12_355, 500, HALF_EVEN, 618], // 617.75
  ])('%p cents × %p bps (%s) → %p', (amount, bps, mode, expected) => {
    expect(computeBasisPointShareCents(amount, bps, mode)).toBe(expected);
  });

  describe('an exact half cent', () => {
    // 5% of 10 cents = 0.5 cents; 5% of 30 cents = 1.5 cents.
    it('HALF_UP always goes up', () => {
      expect(computeBasisPointShareCents(10, 500, HALF_UP)).toBe(1);
      expect(computeBasisPointShareCents(30, 500, HALF_UP)).toBe(2);
    });

    it('HALF_EVEN goes to the even cent', () => {
      expect(computeBasisPointShareCents(10, 500, HALF_EVEN)).toBe(0);
      expect(computeBasisPointShareCents(30, 500, HALF_EVEN)).toBe(2);
    });

    it('DOWN drops it', () => {
      expect(computeBasisPointShareCents(30, 500, DOWN)).toBe(1);
    });
  });

  it('is exact at the top of the safe-integer range (the product would overflow a double)', () => {
    // MAX_SAFE_INTEGER × 2,000 bps is beyond 2^53; BigInt keeps it exact.
    // 9,007,199,254,740,991 × 0.2 = 1,801,439,850,948,198.2
    expect(computeBasisPointShareCents(Number.MAX_SAFE_INTEGER, 2_000, HALF_EVEN)).toBe(1_801_439_850_948_198);
  });

  it('returns the whole amount at 10,000 bps and nothing at 0 bps', () => {
    expect(computeBasisPointShareCents(987_654, 10_000, MONEY_ROUNDING_MODE)).toBe(987_654);
    expect(computeBasisPointShareCents(987_654, 0, MONEY_ROUNDING_MODE)).toBe(0);
  });

  it.each([
    [-1, 500],
    [1.5, 500],
    [100, -1],
    [100, 10_001],
    [100, 2.5],
  ])('rejects amount %p with %p bps', (amount, bps) => {
    expect(() => computeBasisPointShareCents(amount, bps, MONEY_ROUNDING_MODE)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_AMOUNT }),
    );
  });

  it('uses half-even as the documented project rule', () => {
    expect(MONEY_ROUNDING_MODE).toBe(HALF_EVEN);
  });
});
