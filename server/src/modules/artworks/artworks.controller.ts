import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, toOpenApiSchema } from '../../common/validation';
import { ArtworkCatalogService } from './artwork-catalog.service';
import {
  ArtworkDetailView,
  ArtworkListView,
  artworkDetailViewSchema,
  artworkListViewSchema,
  toArtworkDetailView,
  toArtworkSummaryView,
} from './artwork.view';
import { ARTWORK_MEDIUMS } from './artworks.types';
import { ListArtworksQuery, MAXIMUM_ARTWORK_PAGE_SIZE, listArtworksQuerySchema } from './dto/list-artworks.dto';

@ApiTags('artworks')
@Controller('artworks')
export class ArtworksController {
  constructor(private readonly catalogService: ArtworkCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Browse the catalog, newest first' })
  @ApiQuery({ name: 'query', required: false, description: 'Matches the title or the artist name, case-insensitively.' })
  @ApiQuery({ name: 'medium', required: false, enum: ARTWORK_MEDIUMS })
  @ApiQuery({ name: 'artist', required: false, description: 'Artist slug, e.g. amara-okafor.' })
  @ApiQuery({ name: 'limit', required: false, description: `1–${MAXIMUM_ARTWORK_PAGE_SIZE}, default 50.` })
  @ApiOkResponse({ schema: toOpenApiSchema(artworkListViewSchema) })
  async listArtworks(
    @Query(new ZodValidationPipe(listArtworksQuerySchema)) query: ListArtworksQuery,
  ): Promise<ArtworkListView> {
    const artworks = await this.catalogService.listArtworks(query);
    return { items: artworks.map(toArtworkSummaryView) };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One artwork, with its artist' })
  @ApiOkResponse({ schema: toOpenApiSchema(artworkDetailViewSchema) })
  @ApiNotFoundResponse({ description: 'ARTWORK_NOT_FOUND' })
  async getArtwork(@Param('slug') slug: string): Promise<ArtworkDetailView> {
    return toArtworkDetailView(await this.catalogService.getArtworkBySlug(slug));
  }
}
