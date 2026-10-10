import { Module } from '@nestjs/common';
import { ArtworksModule } from '../artworks';
import { ClosingModule } from '../closing';
import { LedgerModule } from '../ledger';
import { OutboxModule } from '../outbox';
import { PaymentsModule } from '../payments';
import { CheckoutController } from './checkout.controller';
import { PurchaseSettlementService } from './purchase-settlement.service';
import { PurchaseRepository } from './purchase.repository';
import { PurchaseService } from './purchase.service';
import { StripeWebhooksController } from './stripe-webhooks.controller';

@Module({
  imports: [ClosingModule, ArtworksModule, PaymentsModule, LedgerModule, OutboxModule],
  controllers: [CheckoutController, StripeWebhooksController],
  providers: [PurchaseRepository, PurchaseService, PurchaseSettlementService],
  exports: [PurchaseService, PurchaseSettlementService],
})
export class PurchasesModule {}
