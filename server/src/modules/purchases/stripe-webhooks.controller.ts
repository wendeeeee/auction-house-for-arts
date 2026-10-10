import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { PurchaseSettlementService, WebhookHandlingResult } from './purchase-settlement.service';

@ApiTags('webhooks')
@Controller('webhooks/stripe')
export class StripeWebhooksController {
  constructor(private readonly settlementService: PurchaseSettlementService) {}

  /** 200 for every verified event, even one ignored, so Stripe stops retrying it. */
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe webhook endpoint; the only thing that confirms a payment' })
  @ApiBadRequestResponse({ description: 'INVALID_WEBHOOK_SIGNATURE' })
  @ApiServiceUnavailableResponse({ description: 'PAYMENTS_UNAVAILABLE' })
  async receive(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signatureHeader: string | undefined,
  ): Promise<{ received: true; outcome: WebhookHandlingResult }> {
    const outcome = await this.settlementService.handleWebhook(request.rawBody ?? Buffer.alloc(0), signatureHeader);
    return { received: true, outcome };
  }
}
