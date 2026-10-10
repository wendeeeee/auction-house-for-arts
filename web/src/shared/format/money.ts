/**
 * Money arrives from the API as integer cents. These helpers only display and read amounts;
 * they use integer and string arithmetic, never `cents / 100`, so no float rounding can creep
 * into what a bidder sees or submits.
 */

/** `31000` → `"$310"`, `105001` → `"$1,050.01"`. Whole-dollar amounts drop the `.00`. */
export function formatCents(amountCents: number): string {
  const sign = amountCents < 0 ? '-' : '';
  const absoluteCents = Math.abs(Math.trunc(amountCents));
  const centsPart = absoluteCents % 100;
  const dollarsPart = (absoluteCents - centsPart) / 100;
  const groupedDollars = String(dollarsPart).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return centsPart === 0
    ? `${sign}$${groupedDollars}`
    : `${sign}$${groupedDollars}.${String(centsPart).padStart(2, '0')}`;
}

const DOLLAR_AMOUNT_PATTERN = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Reads what a person typed (`"1,250"`, `"$80.5"`) as cents, or null if it is not a dollar
 * amount with at most two decimal places. Works on the digits as text, so `"0.29"` is exactly 29.
 */
export function parseDollarsToCents(text: string): number | null {
  const match = DOLLAR_AMOUNT_PATTERN.exec(text.trim());
  if (!match) return null;
  const dollarDigits = (match[1] ?? '').replaceAll(',', '');
  const centDigits = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(dollarDigits + centDigits);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** The value to prefill an amount input with: `105001` → `"1050.01"`, `31000` → `"310"`. */
export function centsToDollarInput(amountCents: number): string {
  return formatCents(amountCents).replace('$', '').replaceAll(',', '');
}
