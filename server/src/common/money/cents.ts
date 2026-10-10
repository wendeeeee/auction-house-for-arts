import { InvalidAmountError } from '../errors';

/**
 * Money is an integer number of US cents, held in a JS `number`. Every value that enters
 * the money path passes through `assertSafeCents`, so arithmetic stays exact: a safe integer
 * goes up to 2^53 − 1 cents (about $90 trillion), far beyond any artwork price.
 */
export function assertSafeCents(value: unknown, field = 'amountCents'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new InvalidAmountError(`${field} must be a whole number of cents.`, {
      field,
      value: String(value),
    });
  }
  return value;
}

export function assertNonNegativeCents(value: unknown, field = 'amountCents'): number {
  const cents = assertSafeCents(value, field);
  if (cents < 0) {
    throw new InvalidAmountError(`${field} must not be negative.`, { field, value: String(value) });
  }
  return cents;
}

/** `123456` → `"$1,234.56"`, `-5` → `"-$0.05"`. Integer arithmetic only: no float division. */
export function formatCents(amountCents: number): string {
  const cents = assertSafeCents(amountCents);
  const sign = cents < 0 ? '-' : '';
  const absoluteCents = Math.abs(cents);
  const centsPart = absoluteCents % 100;
  // Exact: the dividend is a multiple of 100, so the quotient is an integer.
  const dollarsPart = (absoluteCents - centsPart) / 100;
  const groupedDollars = String(dollarsPart).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${groupedDollars}.${String(centsPart).padStart(2, '0')}`;
}

const DOLLAR_AMOUNT_PATTERN = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a non-negative dollar amount typed by a person (`"1,234.5"`, `"$80"`) into cents.
 * Works on the digits as text, so `"0.29"` is exactly 29 cents rather than `0.29 * 100`.
 * More than two decimal places is rejected rather than rounded: the user meant something
 * we cannot represent.
 */
export function parseDollarsToCents(text: string): number {
  const match = DOLLAR_AMOUNT_PATTERN.exec(text.trim());
  if (!match) {
    throw new InvalidAmountError('Amount must be a dollar value with at most two decimal places.', {
      value: text,
    });
  }
  const dollarDigits = (match[1] ?? '').replaceAll(',', '');
  const centDigits = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(dollarDigits + centDigits);
  if (!Number.isSafeInteger(cents)) {
    throw new InvalidAmountError('Amount is too large.', { value: text });
  }
  return cents;
}
