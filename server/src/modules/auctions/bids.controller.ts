import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser, CurrentUser, RequireUser } from '../../common/identity';
import { ZodValidationPipe, toOpenApiRequestSchema, toOpenApiSchema } from '../../common/validation';
import { PlaceMaximumBidResultView, placeMaximumBidResultViewSchema } from './auction.view';
import { BiddingService } from './bidding.service';
import { PlaceMaximumBidBody, placeMaximumBidBodySchema } from './dto/place-maximum-bid.dto';

@ApiTags('auctions')
@Controller('auctions/:slug/bids')
export class BidsController {
  constructor(private readonly biddingService: BiddingService) {}

  @Post()
  @RequireUser()
  @ApiOperation({
    summary: 'Place or raise your maximum bid',
    description: 'Being outbid at once by an existing maximum is not an error: the bid is accepted with leading: false.',
  })
  @ApiBody({ schema: toOpenApiRequestSchema(placeMaximumBidBodySchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(placeMaximumBidResultViewSchema) })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' })
  @ApiNotFoundResponse({ description: 'AUCTION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'BID_TOO_LOW, AUCTION_ENDED, NOT_ALLOWED_TO_BID, or MAX_NOT_RAISED' })
  async placeMaximumBid(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser | null,
    @Body(new ZodValidationPipe(placeMaximumBidBodySchema)) body: PlaceMaximumBidBody,
  ): Promise<PlaceMaximumBidResultView> {
    if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
    const outcome = await this.biddingService.placeMaximumBid(user, slug, body.maxBidCents);
    return {
      leading: outcome.isLeading,
      priceCents: outcome.priceCents,
      minimumNextBidCents: outcome.minimumNextBidCents,
      endsAt: outcome.endsAt.toISOString(),
      extended: outcome.isExtended,
    };
  }
}
