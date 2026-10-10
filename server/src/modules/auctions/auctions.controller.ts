import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Clock } from '../../common/clock';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser, CurrentUser, RequireUser } from '../../common/identity';
import { ZodValidationPipe, toOpenApiRequestSchema, toOpenApiSchema } from '../../common/validation';
import { ARTWORK_MEDIUMS } from '../artworks';
import { AuctionService } from './auction.service';
import {
  AuctionDetailView,
  AuctionListView,
  auctionDetailViewSchema,
  auctionListViewSchema,
  toAuctionDetailView,
  toAuctionSummaryView,
} from './auction.view';
import { AUCTION_LIST_SORTS, AUCTION_STATUS_FILTERS } from './auctions.types';
import { CreateAuctionBody, createAuctionBodySchema } from './dto/create-auction.dto';
import { ListAuctionsQuery, MAXIMUM_AUCTION_PAGE_SIZE, listAuctionsQuerySchema } from './dto/list-auctions.dto';

@ApiTags('auctions')
@Controller('auctions')
export class AuctionsController {
  constructor(
    private readonly auctionService: AuctionService,
    private readonly clock: Clock,
  ) {}

  @Post()
  @RequireUser()
  @ApiOperation({ summary: 'Put an artwork you own up for auction' })
  @ApiBody({ schema: toOpenApiRequestSchema(createAuctionBodySchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(auctionDetailViewSchema) })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' })
  @ApiForbiddenResponse({ description: 'NOT_ARTWORK_OWNER' })
  @ApiNotFoundResponse({ description: 'ARTWORK_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ARTWORK_ALREADY_AT_AUCTION' })
  async createAuction(
    @CurrentUser() user: AuthenticatedUser | null,
    @Body(new ZodValidationPipe(createAuctionBodySchema)) body: CreateAuctionBody,
  ): Promise<AuctionDetailView> {
    if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
    return toAuctionDetailView(await this.auctionService.createAuction(user, body), this.clock.now());
  }

  @Get()
  @ApiOperation({ summary: 'Browse auctions' })
  @ApiQuery({ name: 'status', required: false, enum: AUCTION_STATUS_FILTERS, description: 'Default open.' })
  @ApiQuery({ name: 'medium', required: false, enum: ARTWORK_MEDIUMS })
  @ApiQuery({ name: 'artwork', required: false, description: 'Artwork slug: that artwork’s auctions only.' })
  @ApiQuery({ name: 'sort', required: false, enum: AUCTION_LIST_SORTS, description: 'Default ending_soon.' })
  @ApiQuery({ name: 'limit', required: false, description: `1–${MAXIMUM_AUCTION_PAGE_SIZE}, default 50.` })
  @ApiOkResponse({ schema: toOpenApiSchema(auctionListViewSchema) })
  async listAuctions(
    @Query(new ZodValidationPipe(listAuctionsQuerySchema)) query: ListAuctionsQuery,
  ): Promise<AuctionListView> {
    const listings = await this.auctionService.listAuctions(query);
    const now = this.clock.now();
    return { items: listings.map((listing) => toAuctionSummaryView(listing, now)) };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One auction: price, reserve status, history, and your own maximum' })
  @ApiOkResponse({ schema: toOpenApiSchema(auctionDetailViewSchema) })
  @ApiNotFoundResponse({ description: 'AUCTION_NOT_FOUND' })
  async getAuction(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<AuctionDetailView> {
    return toAuctionDetailView(await this.auctionService.getAuctionDetails(slug, user), this.clock.now());
  }
}
