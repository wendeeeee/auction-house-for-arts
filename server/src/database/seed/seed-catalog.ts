import type { Pool } from 'pg';
import { SEED_ARTISTS, SEED_ARTWORKS, SEED_USERS } from './seed-data';

export interface SeedResult {
  readonly usersInserted: number;
  readonly artistsInserted: number;
  readonly artworksInserted: number;
}

/**
 * Inserts the demo catalog in one transaction. Safe to re-run: rows are keyed by fixed IDs
 * and existing ones are left untouched (`ON CONFLICT (id) DO NOTHING`), so a re-run never
 * overwrites changes made through the app (an ownership transfer after a sale, for example).
 */
export async function seedCatalog(pool: Pool): Promise<SeedResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let usersInserted = 0;
    for (const user of SEED_USERS) {
      const { rowCount } = await client.query(
        'INSERT INTO users (id, display_name, handle) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [user.id, user.displayName, user.handle],
      );
      usersInserted += rowCount ?? 0;
    }
    let artistsInserted = 0;
    for (const artist of SEED_ARTISTS) {
      const { rowCount } = await client.query(
        `INSERT INTO artists (id, user_id, slug, name, bio, royalty_bps)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [artist.id, artist.userId, artist.slug, artist.name, artist.bio, artist.royaltyBps],
      );
      artistsInserted += rowCount ?? 0;
    }
    let artworksInserted = 0;
    for (const artwork of SEED_ARTWORKS) {
      const { rowCount } = await client.query(
        `INSERT INTO artworks (id, slug, artist_id, title, year, medium, dimensions, description, owner_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
        [
          artwork.id,
          artwork.slug,
          artwork.artistId,
          artwork.title,
          artwork.year,
          artwork.medium,
          artwork.dimensions,
          artwork.description,
          artwork.ownerUserId,
          artwork.createdAt,
        ],
      );
      artworksInserted += rowCount ?? 0;
    }
    await client.query('COMMIT');
    return { usersInserted, artistsInserted, artworksInserted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function isCatalogEmpty(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query<{ has_users: boolean }>('SELECT EXISTS (SELECT 1 FROM users) AS has_users');
  return !rows[0]?.has_users;
}
