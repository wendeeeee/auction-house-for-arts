import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser, CurrentUser, RequireUser } from '../../common/identity';
import { toOpenApiSchema } from '../../common/validation';
import { PurchaseService } from './purchase.service';
import {
  CheckoutStatusView,
  StartedCheckoutView,
  checkoutStatusViewSchema,
  startedCheckoutViewSchema,
  toCheckoutStatusView,
  toStartedCheckoutView,
} from './purchase.view';

@ApiTags('checkout')
@Controller('auctions/:slug/checkout')
@RequireUser()
export class CheckoutController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start (or resume) paying for an auction you won',
    description: 'Returns the hosted checkout URL. Reuses the open session; payment is confirmed only by the provider’s webhook.',
  })
  @ApiOkResponse({ schema: toOpenApiSchema(startedCheckoutViewSchema) })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' })
  @ApiForbiddenResponse({ description: 'NOT_AUCTION_WINNER' })
  @ApiNotFoundResponse({ description: 'AUCTION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'AUCTION_NOT_SOLD, PURCHASE_ALREADY_PAID, PAYMENT_IN_PROGRESS' })
  @ApiServiceUnavailableResponse({ description: 'PAYMENTS_UNAVAILABLE: no Stripe keys configured' })
  async startCheckout(@Param('slug') slug: string, @CurrentUser() user: AuthenticatedUser | null): Promise<StartedCheckoutView> {
    if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
    return toStartedCheckoutView(await this.purchaseService.startCheckout(user, slug));
  }

  @Get()
  @ApiOperation({
    summary: 'Payment status of an auction you won or sold',
    description: 'The buyer sees the amount and status; the seller sees only awaiting_payment or paid.',
  })
  @ApiOkResponse({ schema: toOpenApiSchema(checkoutStatusViewSchema) })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' })
  @ApiForbiddenResponse({ description: 'NOT_PURCHASE_PARTY' })
  @ApiNotFoundResponse({ description: 'AUCTION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'AUCTION_NOT_SOLD' })
  async getCheckoutStatus(@Param('slug') slug: string, @CurrentUser() user: AuthenticatedUser | null): Promise<CheckoutStatusView> {
    if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
    return toCheckoutStatusView(await this.purchaseService.getCheckoutStatus(user, slug));
  }
}
