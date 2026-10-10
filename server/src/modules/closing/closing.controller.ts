import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/identity';
import { toOpenApiSchema } from '../../common/validation';
import { AuctionCloseService } from './auction-close.service';
import { AuctionOutcomeView, auctionOutcomeViewSchema, toAuctionOutcomeView } from './closing.view';

/** Served here, not in the auction detail, so auctions never depends on closing. */
@ApiTags('auctions')
@Controller('auctions/:slug/outcome')
export class ClosingController {
  constructor(private readonly auctionCloseService: AuctionCloseService) {}

  @Get()
  @ApiOperation({
    summary: 'The recorded outcome of an auction',
    description: 'Public. `youWon` is true only when the requesting user won.',
  })
  @ApiOkResponse({ schema: toOpenApiSchema(auctionOutcomeViewSchema) })
  @ApiNotFoundResponse({ description: 'AUCTION_NOT_FOUND' })
  async getOutcome(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<AuctionOutcomeView> {
    return toAuctionOutcomeView(await this.auctionCloseService.getOutcome(slug, user));
  }
}
