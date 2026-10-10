import { ErrorCode } from '../errors';
import { assertNonNegativeCents, assertSafeCents, formatCents, parseDollarsToCents } from './cents';

describe('assertSafeCents', () => {
  it.each([0, 1, -1, 123_456, Number.MAX_SAFE_INTEGER])('accepts %p', (value) => {
    expect(assertSafeCents(value)).toBe(value);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '100', null, undefined, 10n])(
    'rejects %p with INVALID_AMOUNT',
    (value) => {
      expect(() => assertSafeCents(value, 'priceCents')).toThrow(
        expect.objectContaining({ code: ErrorCode.INVALID_AMOUNT, details: expect.objectContaining({ field: 'priceCents' }) }),
      );
    },
  );

  it('rejects negatives only when asked to', () => {
    expect(assertSafeCents(-100)).toBe(-100);
    expect(() => assertNonNegativeCents(-100)).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_AMOUNT }));
  });
});

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [99, '$0.99'],
    [100, '$1.00'],
    [123_456, '$1,234.56'],
    [100_000_000, '$1,000,000.00'],
    [-5, '-$0.05'],
    [-123_456, '-$1,234.56'],
    [Number.MAX_SAFE_INTEGER, '$90,071,992,547,409.91'],
  ])('%p → %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });
});

describe('parseDollarsToCents', () => {
  it.each([
    ['0', 0],
    ['0.29', 29],
    ['0.5', 50],
    ['80', 8_000],
    ['$80', 8_000],
    ['1234.56', 123_456],
    ['1,234.56', 123_456],
    ['  12.30  ', 1_230],
    ['1,000,000', 100_000_000],
  ])('%p → %p cents', (text, expected) => {
    expect(parseDollarsToCents(text)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1.234', '12,34', '1,2345', '.5', '1.', '$', '1e3', '١٢'])('rejects %p', (text) => {
    expect(() => parseDollarsToCents(text)).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_AMOUNT }));
  });

  it('rejects an amount beyond the safe-integer range instead of losing precision', () => {
    expect(() => parseDollarsToCents('900719925474099.92')).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_AMOUNT }),
    );
  });

  it('round-trips with formatCents', () => {
    for (const cents of [0, 1, 99, 100, 123_456, 98_765_432_10]) {
      expect(parseDollarsToCents(formatCents(cents))).toBe(cents);
    }
  });
});
