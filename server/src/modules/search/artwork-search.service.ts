import { Injectable } from '@nestjs/common';
import { ArtistsService } from '../artists';
import { ArtworkCatalogService } from '../artworks';
import { AuctionListing, AuctionService } from '../auctions';
import { UsersService } from '../users';
import { SearchFilters } from './search.types';

/**
 * The one search behind both the search page and the Concierge's search tool. It composes the
 * owning modules' public services: artworks narrow by text, medium, and artist; auctions by
 * status, price, and end time.
 */
@Injectable()
export class ArtworkSearchService {
  constructor(
    private readonly artworkCatalog: ArtworkCatalogService,
    private readonly artistsService: ArtistsService,
    private readonly usersService: UsersService,
    private readonly auctionService: AuctionService,
  ) {}

  async searchAuctions(filters: SearchFilters, limit: number): Promise<AuctionListing[]> {
    const artistIds = filters.artist === null ? null : await this.findArtistIds(filters.artist);
    const needsArtworkFilter = filters.keywords.length > 0 || filters.medium !== null || artistIds !== null;
    const artworkIds = needsArtworkFilter
      ? await this.artworkCatalog.findArtworkIdsMatching({ keywords: filters.keywords, medium: filters.medium, artistIds })
      : null;

    return this.auctionService.searchAuctions({
      artworkIds,
      status: filters.status,
      minimumPriceCents: filters.minPriceCents,
      maximumPriceCents: filters.maxPriceCents,
      endingWithinHours: filters.endingWithinHours,
      sort: filters.sort,
      limit,
    });
  }

  /** A name or slug, or the handle of the artist's user account ("@mei_tanaka" or "mei_tanaka"). */
  private async findArtistIds(artist: string): Promise<string[]> {
    const text = artist.trim().replace(/^@/, '');
    const user = await this.usersService.findUserByHandle(text.toLowerCase());
    return this.artistsService.findArtistIdsByNameSlugOrUser(text, user?.id ?? null);
  }
}
