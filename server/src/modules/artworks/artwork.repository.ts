import { Injectable } from '@nestjs/common';
import { UnitOfWork, escapeLikePattern } from '../../database';
import { Artwork, ArtworkMedium } from './artworks.types';

interface ArtworkRow {
  id: string;
  slug: string;
  artist_id: string;
  title: string;
  year: number | null;
  medium: ArtworkMedium;
  dimensions: string;
  description: string;
  owner_user_id: string;
  created_at: Date;
}

const ARTWORK_COLUMNS =
  'id, slug, artist_id, title, year, medium, dimensions, description, owner_user_id, created_at';

export interface ArtworkListFilter {
  /** Case-insensitive substring of the title. */
  readonly searchText?: string;
  /** With `searchText`: also match these artists' works (the artists whose name matched). */
  readonly artistIdsMatchingSearch?: readonly string[];
  readonly medium?: ArtworkMedium;
  readonly artistId?: string;
  readonly limit: number;
}

export interface ArtworkMatchCriteria {
  /** Every keyword must match the title, the description, or (through `artistIds`) the artist's name. */
  readonly keywords: readonly { readonly text: string; readonly artistIds: readonly string[] }[];
  readonly medium?: ArtworkMedium;
  readonly artistIds?: readonly string[];
}

/** Owns the `artworks` table. */
@Injectable()
export class ArtworkRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /** Newest first. Every value is a bound parameter; only fixed SQL fragments are concatenated. */
  async list(filter: ArtworkListFilter): Promise<Artwork[]> {
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    const bind = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (filter.searchText !== undefined) {
      const titleMatches = `title ILIKE ${bind(`%${escapeLikePattern(filter.searchText)}%`)}`;
      const artistIds = filter.artistIdsMatchingSearch ?? [];
      conditions.push(
        artistIds.length > 0 ? `(${titleMatches} OR artist_id = ANY(${bind(artistIds)}::uuid[]))` : titleMatches,
      );
    }
    if (filter.medium !== undefined) conditions.push(`medium = ${bind(filter.medium)}`);
    if (filter.artistId !== undefined) conditions.push(`artist_id = ${bind(filter.artistId)}`);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.unitOfWork
      .client()
      .query<ArtworkRow>(
        `SELECT ${ARTWORK_COLUMNS} FROM artworks ${where} ORDER BY created_at DESC, id LIMIT ${bind(filter.limit)}`,
        parameters,
      );
    return rows.map(toArtwork);
  }

  async findBySlug(slug: string): Promise<Artwork | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<ArtworkRow>(`SELECT ${ARTWORK_COLUMNS} FROM artworks WHERE slug = $1`, [slug]);
    return rows[0] ? toArtwork(rows[0]) : null;
  }

  async findByIds(ids: readonly string[]): Promise<Artwork[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.unitOfWork
      .client()
      .query<ArtworkRow>(`SELECT ${ARTWORK_COLUMNS} FROM artworks WHERE id = ANY($1::uuid[])`, [ids]);
    return rows.map(toArtwork);
  }

  /** Compare-and-set on the current owner: false when the artwork is no longer `fromUserId`'s. */
  async transferOwnership(artworkId: string, fromUserId: string, toUserId: string): Promise<boolean> {
    const { rowCount } = await this.unitOfWork
      .requireTransaction()
      .query('UPDATE artworks SET owner_user_id = $3 WHERE id = $1 AND owner_user_id = $2', [artworkId, fromUserId, toUserId]);
    return rowCount === 1;
  }

  async findIdsMatching(criteria: ArtworkMatchCriteria): Promise<string[]> {
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    const bind = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    for (const keyword of criteria.keywords) {
      const pattern = bind(`%${escapeLikePattern(keyword.text)}%`);
      const textMatches = `title ILIKE ${pattern} OR description ILIKE ${pattern}`;
      conditions.push(
        keyword.artistIds.length > 0
          ? `(${textMatches} OR artist_id = ANY(${bind(keyword.artistIds)}::uuid[]))`
          : `(${textMatches})`,
      );
    }
    if (criteria.medium !== undefined) conditions.push(`medium = ${bind(criteria.medium)}`);
    if (criteria.artistIds !== undefined) conditions.push(`artist_id = ANY(${bind(criteria.artistIds)}::uuid[])`);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.unitOfWork.client().query<{ id: string }>(`SELECT id FROM artworks ${where}`, parameters);
    return rows.map((row) => row.id);
  }

  async findIdsByMedium(medium: ArtworkMedium): Promise<string[]> {
    const { rows } = await this.unitOfWork
      .client()
      .query<{ id: string }>('SELECT id FROM artworks WHERE medium = $1', [medium]);
    return rows.map((row) => row.id);
  }
}

function toArtwork(row: ArtworkRow): Artwork {
  return {
    id: row.id,
    slug: row.slug,
    artistId: row.artist_id,
    title: row.title,
    year: row.year,
    medium: row.medium,
    dimensions: row.dimensions,
    description: row.description,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
  };
}
