import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { toOpenApiSchema } from '../../common/validation';
import { ArtistListView, artistListViewSchema, toArtistView } from './artist.view';
import { ArtistsService } from './artists.service';

@ApiTags('artists')
@Controller('artists')
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Get()
  @ApiOperation({ summary: 'List artists (for the catalog filter)' })
  @ApiOkResponse({ schema: toOpenApiSchema(artistListViewSchema) })
  async listArtists(): Promise<ArtistListView> {
    const artists = await this.artistsService.listArtists();
    return { items: artists.map(toArtistView) };
  }
}
