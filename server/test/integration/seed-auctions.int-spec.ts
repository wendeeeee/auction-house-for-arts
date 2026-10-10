import type { Pool } from 'pg';
import { SEED_AUCTIONS, seedDemoAuctions } from '../../src/database/seed/seed-auctions';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const NOW = new Date('2026-03-01T12:00:00.000Z');

describe('seedDemoAuctions', () => {
  let pool: Pool;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    await seedCatalog(pool);
  });

  it('opens each demo auction, sold by the artwork’s owner, at its starting price, ending after now', async () => {
    expect(await seedDemoAuctions(pool, NOW)).toEqual({ auctionsInserted: SEED_AUCTIONS.length });

    const { rows } = await pool.query<{
      seller_is_owner: boolean;
      current_price_cents: number;
      starting_price_cents: number;
      ends_at: Date;
      leader_user_id: string | null;
    }>(`SELECT auctions.seller_user_id = artworks.owner_user_id AS seller_is_owner, current_price_cents,
               starting_price_cents, ends_at, leader_user_id
          FROM auctions JOIN artworks ON artworks.id = auctions.artwork_id`);
    expect(rows).toHaveLength(SEED_AUCTIONS.length);
    for (const row of rows) {
      expect(row.seller_is_owner).toBe(true);
      expect(row.current_price_cents).toBe(row.starting_price_cents);
      expect(row.leader_user_id).toBeNull();
      expect(row.ends_at.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('is safe to re-run, and skips an artwork that already has an unclosed auction', async () => {
    await pool.query(
      `INSERT INTO auctions (slug, artwork_id, seller_user_id, starting_price_cents, ends_at, original_ends_at, current_price_cents)
       SELECT 'tide-vessel-by-hand', id, owner_user_id, 100, $1, $1, 100 FROM artworks WHERE slug = 'tide-vessel'`,
      [NOW],
    );

    expect(await seedDemoAuctions(pool, NOW)).toEqual({ auctionsInserted: SEED_AUCTIONS.length - 1 });
    expect(await seedDemoAuctions(pool, NOW)).toEqual({ auctionsInserted: 0 });
  });
});
