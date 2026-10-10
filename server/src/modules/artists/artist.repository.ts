import { Injectable } from '@nestjs/common';
import { UnitOfWork, escapeLikePattern } from '../../database';
import { Artist } from './artists.types';

interface ArtistRow {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  bio: string;
  royalty_bps: number;
  created_at: Date;
}

const ARTIST_COLUMNS = 'id, user_id, slug, name, bio, royalty_bps, created_at';

/** Owns the `artists` table. */
@Injectable()
export class ArtistRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async listAll(): Promise<Artist[]> {
    const { rows } = await this.unitOfWork.client().query<ArtistRow>(`SELECT ${ARTIST_COLUMNS} FROM artists ORDER BY name, id`);
    return rows.map(toArtist);
  }

  async findBySlug(slug: string): Promise<Artist | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<ArtistRow>(`SELECT ${ARTIST_COLUMNS} FROM artists WHERE slug = $1`, [slug]);
    return rows[0] ? toArtist(rows[0]) : null;
  }

  async findByIds(ids: readonly string[]): Promise<Artist[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.unitOfWork
      .client()
      .query<ArtistRow>(`SELECT ${ARTIST_COLUMNS} FROM artists WHERE id = ANY($1::uuid[])`, [ids]);
    return rows.map(toArtist);
  }

  /** Search's `artist` filter: a name substring, the exact slug, or the artist's own user account. */
  async findIdsByNameSlugOrUser(text: string, userId: string | null): Promise<string[]> {
    const { rows } = await this.unitOfWork
      .client()
      .query<{ id: string }>(`SELECT id FROM artists WHERE name ILIKE $1 OR slug = $2 OR user_id = $3`, [
        `%${escapeLikePattern(text)}%`,
        text.toLowerCase(),
        userId,
      ]);
    return rows.map((row) => row.id);
  }

  /** Case-insensitive substring match on the name; served by the trigram index. */
  async findIdsByNameContaining(text: string): Promise<string[]> {
    const { rows } = await this.unitOfWork
      .client()
      .query<{ id: string }>(`SELECT id FROM artists WHERE name ILIKE $1`, [`%${escapeLikePattern(text)}%`]);
    return rows.map((row) => row.id);
  }
}

function toArtist(row: ArtistRow): Artist {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    name: row.name,
    bio: row.bio,
    royaltyBps: row.royalty_bps,
    createdAt: row.created_at,
  };
}
