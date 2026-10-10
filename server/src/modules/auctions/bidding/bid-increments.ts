import { assertNonNegativeCents } from '../../../common/money';

/**
 * Tiers, by the price the increment is added to. `upToCents` is inclusive: a price of exactly
 * $100.00 still uses the $5 increment; $100.01 uses $10.
 */
const INCREMENT_TIERS: readonly { readonly upToCents: number; readonly incrementCents: number }[] = [
  { upToCents: 100_00, incrementCents: 5_00 },
  { upToCents: 1_000_00, incrementCents: 10_00 },
  { upToCents: 5_000_00, incrementCents: 50_00 },
  { upToCents: 25_000_00, incrementCents: 100_00 },
];
const TOP_TIER_INCREMENT_CENTS = 250_00;

/** The step above `priceCents` that the next bid (or the proxy response to it) must reach. */
export function incrementForPriceCents(priceCents: number): number {
  const cents = assertNonNegativeCents(priceCents, 'priceCents');
  return INCREMENT_TIERS.find((tier) => cents <= tier.upToCents)?.incrementCents ?? TOP_TIER_INCREMENT_CENTS;
}
