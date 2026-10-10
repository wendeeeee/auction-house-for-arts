import type { Pool } from 'pg';

export interface SeedAuction {
  readonly id: string;
  readonly slug: string;
  readonly artworkSlug: string;
  readonly startingPriceCents: number;
  readonly reservePriceCents: number | null;
  /** Relative to when the seed runs, so a fresh demo always has live auctions. */
  readonly endsInSeconds: number;
}

const auctionId = (number: number): string => `5eed0000-0000-4000-8000-0000000c00${String(number).padStart(2, '0')}`;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 3_600;

/** No bids are seeded: every bid on the page comes from someone using the demo. */
export const SEED_AUCTIONS: readonly SeedAuction[] = [
  {
    id: auctionId(1),
    slug: 'tide-vessel-lot-1',
    artworkSlug: 'tide-vessel',
    startingPriceCents: 250_00,
    reservePriceCents: 600_00,
    endsInSeconds: 2 * HOUR_SECONDS,
  },
  {
    id: auctionId(2),
    slug: 'frozen-harbour-lot-2',
    artworkSlug: 'frozen-harbour',
    startingPriceCents: 800_00,
    reservePriceCents: null,
    endsInSeconds: 24 * HOUR_SECONDS,
  },
  {
    id: auctionId(3),
    slug: 'desert-geometry-lot-3',
    artworkSlug: 'desert-geometry',
    startingPriceCents: 400_00,
    reservePriceCents: 1_200_00,
    endsInSeconds: 3 * 24 * HOUR_SECONDS,
  },
  {
    // Short, so a demo can watch it close.
    id: auctionId(4),
    slug: 'lagos-at-dusk-lot-4',
    artworkSlug: 'lagos-at-dusk',
    startingPriceCents: 300_00,
    reservePriceCents: null,
    endsInSeconds: 10 * MINUTE_SECONDS,
  },
  {
    // Bid within a minute of seeding to try checkout; a primary sale by Amara Okafor.
    id: auctionId(5),
    slug: 'harmattan-light-lot-5',
    artworkSlug: 'harmattan-light',
    startingPriceCents: 50_00,
    reservePriceCents: null,
    endsInSeconds: MINUTE_SECONDS,
  },
];

/**
 * Opens the demo auctions. Kept apart from `seedCatalog` so tests that need a clean catalog
 * do not inherit auctions.
 *
 * - The seller is whoever owns the artwork when the seed runs (read in the same statement),
 *   so the seller rule holds even after ownership has changed.
 * - `ON CONFLICT DO NOTHING` has no target on purpose. It skips an auction that already exists
 *   by ID, and also one whose artwork already has an unclosed auction (the partial unique
 *   index). Re-running never fails or duplicates.
 */
export async function seedDemoAuctions(pool: Pool, now: Date): Promise<{ auctionsInserted: number }> {
  let auctionsInserted = 0;
  for (const auction of SEED_AUCTIONS) {
    const endsAt = new Date(now.getTime() + auction.endsInSeconds * 1_000);
    const { rowCount } = await pool.query(
      `INSERT INTO auctions (id, slug, artwork_id, seller_user_id, starting_price_cents, reserve_price_cents,
                             ends_at, original_ends_at, current_price_cents, created_at)
       SELECT $1, $2, artworks.id, artworks.owner_user_id, $4, $5, $6, $6, $4, $7
         FROM artworks WHERE artworks.slug = $3
       ON CONFLICT DO NOTHING`,
      [auction.id, auction.slug, auction.artworkSlug, auction.startingPriceCents, auction.reservePriceCents, endsAt, now],
    );
    auctionsInserted += rowCount ?? 0;
  }
  return { auctionsInserted };
}
