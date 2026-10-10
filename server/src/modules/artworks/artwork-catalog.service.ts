import { Injectable } from '@nestjs/common';
import { InvariantViolationError } from '../../common/errors';
import { Artist, ArtistsService } from '../artists';
import { ArtworkImage, ArtworkImageQueryService } from '../images';
import { ArtworkRepository } from './artwork.repository';
import { ArtworkNotFoundError, ArtworkOwnerOnlyError } from './artworks.errors';
import { Artwork, ArtworkMedium } from './artworks.types';
import { ListArtworksQuery } from './dto/list-artworks.dto';

export interface ArtworkWithArtist {
  readonly artwork: Artwork;
  readonly artist: Artist;
  /** Ready images only, in gallery order. */
  readonly images: readonly ArtworkImage[];
}

/**
 * Read side of the catalog. Artist data comes from the artists module's public service rather
 * than a SQL join, because `artists` belongs to that module. The cost is one or two extra
 * indexed queries per request, a fair price at catalog scale for keeping table ownership clear.
 */
@Injectable()
export class ArtworkCatalogService {
  constructor(
    private readonly artworkRepository: ArtworkRepository,
    private readonly artistsService: ArtistsService,
    private readonly imageQueryService: ArtworkImageQueryService,
  ) {}

  async listArtworks(query: ListArtworksQuery): Promise<ArtworkWithArtist[]> {
    let artistId: string | undefined;
    if (query.artist !== undefined) {
      const artist = await this.artistsService.findArtistBySlug(query.artist);
      // A filter for an artist who does not exist matches nothing; it is not an error.
      if (!artist) return [];
      artistId = artist.id;
    }

    const artistIdsMatchingSearch =
      query.query !== undefined ? await this.artistsService.findArtistIdsByNameContaining(query.query) : undefined;

    const artworks = await this.artworkRepository.list({
      searchText: query.query,
      artistIdsMatchingSearch,
      medium: query.medium,
      artistId,
      limit: query.limit,
    });
    return this.attachArtistsAndImages(artworks);
  }

  async getArtworkBySlug(slug: string): Promise<ArtworkWithArtist> {
    const artwork = await this.artworkRepository.findBySlug(slug);
    if (!artwork) throw new ArtworkNotFoundError(slug);
    const [withArtist] = await this.attachArtistsAndImages([artwork]);
    if (!withArtist) throw new InvariantViolationError('attachArtistsAndImages dropped an artwork.', { slug });
    return withArtist;
  }

  /** The artwork's ID, once `userId` is confirmed as its current owner. */
  async getArtworkIdForOwner(slug: string, userId: string): Promise<string> {
    const artwork = await this.artworkRepository.findBySlug(slug);
    if (!artwork) throw new ArtworkNotFoundError(slug);
    if (artwork.ownerUserId !== userId) throw new ArtworkOwnerOnlyError(slug);
    return artwork.id;
  }

  /** For other modules (auctions). Missing IDs are simply absent from the result. */
  async findArtworksByIds(ids: readonly string[]): Promise<ArtworkWithArtist[]> {
    return this.attachArtistsAndImages(await this.artworkRepository.findByIds([...new Set(ids)]));
  }

  /** For the auction list's `?artwork=` filter: null when there is no such artwork. */
  async findArtworkIdBySlug(slug: string): Promise<string | null> {
    return (await this.artworkRepository.findBySlug(slug))?.id ?? null;
  }

  /** For the auction list's `?medium=` filter, so the auctions module never reads `artworks`. */
  findArtworkIdsByMedium(medium: ArtworkMedium): Promise<string[]> {
    return this.artworkRepository.findIdsByMedium(medium);
  }

  private async attachArtistsAndImages(artworks: readonly Artwork[]): Promise<ArtworkWithArtist[]> {
    const [artists, imagesByArtworkId] = await Promise.all([
      this.artistsService.findArtistsByIds(artworks.map((artwork) => artwork.artistId)),
      this.imageQueryService.findReadyImagesByArtworkIds(artworks.map((artwork) => artwork.id)),
    ]);
    const artistsById = new Map(artists.map((artist) => [artist.id, artist]));
    return artworks.map((artwork) => {
      const artist = artistsById.get(artwork.artistId);
      // The foreign key makes this impossible; if it happens, fail loudly rather than drop the row.
      if (!artist) {
        throw new InvariantViolationError('Artwork references a missing artist.', { artworkId: artwork.id });
      }
      return { artwork, artist, images: imagesByArtworkId.get(artwork.id) ?? [] };
    });
  }
}
