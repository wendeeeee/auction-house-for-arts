import { InvalidAmountError } from '../errors';
import { assertNonNegativeCents } from './cents';

/** 10,000 basis points = 100%. */
export const BASIS_POINTS_PER_WHOLE = 10_000;

/** How the fractional cent left over by a percentage is resolved. */
export enum RoundingMode {
  /** Drop the fraction (toward zero). */
  DOWN = 'DOWN',
  /** Nearest cent; exactly half a cent goes up. */
  HALF_UP = 'HALF_UP',
  /** Nearest cent; exactly half a cent goes to the even cent ("banker's rounding"). */
  HALF_EVEN = 'HALF_EVEN',
}

/**
 * The project's one rounding rule for money. Half-even has no systematic bias, so across many
 * royalty and fee calculations neither side collects the half-cents. Callers round once, at
 * the boundary where an exact share becomes a stored amount, and pass this mode explicitly.
 */
export const MONEY_ROUNDING_MODE = RoundingMode.HALF_EVEN;

export function assertBasisPoints(value: unknown, field = 'basisPoints'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > BASIS_POINTS_PER_WHOLE) {
    throw new InvalidAmountError(`${field} must be a whole number from 0 to ${BASIS_POINTS_PER_WHOLE}.`, {
      field,
      value: String(value),
    });
  }
  return value;
}

/**
 * `amountCents × basisPoints / 10,000`, rounded to a whole cent with `roundingMode`.
 *
 * The product is computed in BigInt so it can never lose precision, whatever the amount;
 * the result is at most `amountCents`, so converting back to `number` is exact.
 */
export function computeBasisPointShareCents(
  amountCents: number,
  basisPoints: number,
  roundingMode: RoundingMode,
): number {
  const amount = BigInt(assertNonNegativeCents(amountCents));
  const bps = BigInt(assertBasisPoints(basisPoints));
  const whole = BigInt(BASIS_POINTS_PER_WHOLE);

  const product = amount * bps;
  const quotient = product / whole;
  const remainder = product % whole;
  return Number(quotient + roundingAdjustment(quotient, remainder, whole, roundingMode));
}

/** 0n or 1n: whether the truncated quotient should be bumped up by one cent. */
function roundingAdjustment(quotient: bigint, remainder: bigint, divisor: bigint, roundingMode: RoundingMode): bigint {
  if (remainder === 0n) return 0n;
  const twiceRemainder = remainder * 2n;
  switch (roundingMode) {
    case RoundingMode.DOWN:
      return 0n;
    case RoundingMode.HALF_UP:
      return twiceRemainder >= divisor ? 1n : 0n;
    case RoundingMode.HALF_EVEN:
      if (twiceRemainder > divisor) return 1n;
      if (twiceRemainder < divisor) return 0n;
      return quotient % 2n === 0n ? 0n : 1n;
  }
}
