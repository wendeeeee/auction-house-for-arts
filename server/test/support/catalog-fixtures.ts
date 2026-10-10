import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * Minimal row builders for tests that need precise data (the seed is for demos and e2e).
 * Each returns the generated ID; every column has a sensible default to override.
 */
let sequence = 0;
const nextNumber = (): number => {
  sequence += 1;
  return sequence;
};

export async function insertUser(pool: Pool, overrides: { displayName?: string; handle?: string } = {}): Promise<string> {
  const number = nextNumber();
  const id = randomUUID();
  await pool.query('INSERT INTO users (id, display_name, handle) VALUES ($1, $2, $3)', [
    id,
    overrides.displayName ?? `Test User ${number}`,
    overrides.handle ?? `test_user_${number}`,
  ]);
  return id;
}

export async function insertArtist(
  pool: Pool,
  overrides: { userId?: string; slug?: string; name?: string; royaltyBps?: number } = {},
): Promise<{ artistId: string; userId: string }> {
  const number = nextNumber();
  const userId = overrides.userId ?? (await insertUser(pool));
  const artistId = randomUUID();
  await pool.query('INSERT INTO artists (id, user_id, slug, name, royalty_bps) VALUES ($1, $2, $3, $4, $5)', [
    artistId,
    userId,
    overrides.slug ?? `test-artist-${number}`,
    overrides.name ?? `Test Artist ${number}`,
    overrides.royaltyBps ?? 500,
  ]);
  return { artistId, userId };
}

export async function insertArtwork(
  pool: Pool,
  fields: {
    artistId: string;
    ownerUserId: string;
    title?: string;
    slug?: string;
    medium?: string;
    createdAt?: Date;
  },
): Promise<string> {
  const number = nextNumber();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO artworks (id, slug, artist_id, title, medium, dimensions, owner_user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      fields.slug ?? `test-artwork-${number}`,
      fields.artistId,
      fields.title ?? `Test Artwork ${number}`,
      fields.medium ?? 'Painting',
      '10 × 10 cm',
      fields.ownerUserId,
      fields.createdAt ?? new Date(Date.UTC(2026, 0, 1) + number * 60_000),
    ],
  );
  return id;
}
