import { Injectable } from '@nestjs/common';
import { ArtistRepository } from './artist.repository';
import { Artist } from './artists.types';

/**
 * The artists module's public API for other modules. The artworks module asks here instead of
 * joining the `artists` table, so each table keeps a single owner.
 */
@Injectable()
export class ArtistsService {
  constructor(private readonly artistRepository: ArtistRepository) {}

  listArtists(): Promise<Artist[]> {
    return this.artistRepository.listAll();
  }

  findArtistBySlug(slug: string): Promise<Artist | null> {
    return this.artistRepository.findBySlug(slug);
  }

  findArtistsByIds(ids: readonly string[]): Promise<Artist[]> {
    return this.artistRepository.findByIds([...new Set(ids)]);
  }

  findArtistIdsByNameContaining(text: string): Promise<string[]> {
    return this.artistRepository.findIdsByNameContaining(text);
  }
}
