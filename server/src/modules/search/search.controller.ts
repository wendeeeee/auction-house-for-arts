import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Clock } from '../../common/clock';
import { ZodValidationPipe, toOpenApiSchema } from '../../common/validation';
import { toAuctionSummaryView } from '../auctions';
import { ArtworkSearchService } from './artwork-search.service';
import { SearchQuery, searchQuerySchema } from './dto/search.dto';
import { applyExplicitFilters } from './explicit-search-filters';
import { SearchQueryInterpreterService } from './query-interpretation/search-query-interpreter.service';
import { EMPTY_SEARCH_FILTERS, InterpretedQuery } from './search.types';
import { SearchResultView, searchResultViewSchema } from './search.view';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly interpreter: SearchQueryInterpreterService,
    private readonly artworkSearch: ArtworkSearchService,
    private readonly clock: Clock,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search auctions by text or by explicit filters' })
  @ApiQuery({ name: 'q', required: false, description: 'Keywords or a sentence such as “open oil paintings under $5k”.' })
  @ApiQuery({ name: 'mode', required: false, enum: ['filters'], description: 'filters: the URL already carries the filters; the text is not interpreted.' })
  @ApiQuery({ name: 'keywords', required: false, description: 'Comma-separated.' })
  @ApiQuery({ name: 'minPrice', required: false, description: 'Whole US dollars.' })
  @ApiQuery({ name: 'maxPrice', required: false, description: 'Whole US dollars.' })
  @ApiOkResponse({ schema: toOpenApiSchema(searchResultViewSchema) })
  async search(@Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery): Promise<SearchResultView> {
    const interpreted: InterpretedQuery =
      query.mode === 'filters'
        ? { filters: EMPTY_SEARCH_FILTERS, interpretation: 'explicit' }
        : await this.interpreter.interpret(query.q);
    const filters = applyExplicitFilters(interpreted.filters, query);
    const listings = await this.artworkSearch.searchAuctions(filters, query.limit);
    const now = this.clock.now();
    return {
      query: query.q.trim(),
      interpretation: interpreted.interpretation,
      filters,
      items: listings.map((listing) => toAuctionSummaryView(listing, now)),
    };
  }
}
