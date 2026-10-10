import type { Pool } from 'pg';
import { isCatalogEmpty, seedCatalog } from '../../src/database/seed/seed-catalog';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

describe('seedCatalog', () => {
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
  });

  async function count(table: string): Promise<number> {
    const { rows } = await pool.query<{ count: number }>(`SELECT count(*) AS count FROM ${table}`);
    return rows[0]?.count ?? 0;
  }

  it('inserts the demo catalog, passing every database constraint', async () => {
    expect(await isCatalogEmpty(pool)).toBe(true);

    expect(await seedCatalog(pool)).toEqual({ usersInserted: 10, artistsInserted: 4, artworksInserted: 16 });
    expect(await isCatalogEmpty(pool)).toBe(false);
  });

  it('is safe to re-run: nothing is duplicated or overwritten', async () => {
    await seedCatalog(pool);
    await pool.query(`UPDATE artworks SET title = 'Retitled by a test' WHERE slug = 'harmattan-light'`);

    expect(await seedCatalog(pool)).toEqual({ usersInserted: 0, artistsInserted: 0, artworksInserted: 0 });
    expect([await count('users'), await count('artists'), await count('artworks')]).toEqual([10, 4, 16]);
    const { rows } = await pool.query(`SELECT title FROM artworks WHERE slug = 'harmattan-light'`);
    expect(rows[0]).toEqual({ title: 'Retitled by a test' });
  });

  it('covers every medium, and both primary sales and resales', async () => {
    await seedCatalog(pool);

    const { rows: mediums } = await pool.query<{ medium: string }>('SELECT DISTINCT medium FROM artworks ORDER BY medium');
    expect(mediums.map((row) => row.medium)).toEqual(['Digital', 'Drawing', 'Painting', 'Photography', 'Print', 'Sculpture']);

    const { rows } = await pool.query<{ primary_sales: number; resales: number }>(`
      SELECT count(*) FILTER (WHERE w.owner_user_id = a.user_id)  AS primary_sales,
             count(*) FILTER (WHERE w.owner_user_id <> a.user_id) AS resales
        FROM artworks w JOIN artists a ON a.id = w.artist_id`);
    expect(rows[0]?.primary_sales).toBeGreaterThan(0);
    expect(rows[0]?.resales).toBeGreaterThan(0);
  });
});
