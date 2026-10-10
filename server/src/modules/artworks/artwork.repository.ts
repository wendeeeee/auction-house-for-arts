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
