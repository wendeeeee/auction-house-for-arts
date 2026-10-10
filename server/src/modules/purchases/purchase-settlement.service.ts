import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { Clock } from '../../common/clock';
import { InvariantViolationError } from '../../common/errors';
import { withSpan } from '../../common/tracing';
import { UnitOfWork } from '../../database';
import { ArtworkCatalogService, ArtworkOwnershipService, resolveSaleType } from '../artworks';
import { AuctionCloseService } from '../closing';
import { LedgerService } from '../ledger';
import { OutboxService } from '../outbox';
import {
  CheckoutSession,
  PAYMENTS_PROVIDER,
  PaymentEventLog,
  PaymentEventOutcome,
  PaymentsProvider,
  VerifiedPaymentEvent,
} from '../payments';
import { decidePurchaseTransition } from './purchase-transitions';
import { PurchaseRepository } from './purchase.repository';
import { Purchase } from './purchases.types';

export type WebhookHandlingResult = PaymentEventOutcome | 'duplicate';

const purchaseIdSchema = z.uuid();

interface OutcomeWithDetails {
  readonly outcome: PaymentEventOutcome;
  readonly details?: Record<string, unknown>;
}

/**
 * Confirms payments from verified webhooks. Lock order in the transaction: payment_events key,
 * purchases row, artworks row, ledger accounts, outbox.
 */
@Injectable()
export class PurchaseSettlementService {
  private readonly logger = new Logger(PurchaseSettlementService.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly purchaseRepository: PurchaseRepository,
    private readonly paymentEventLog: PaymentEventLog,
    private readonly auctionCloseService: AuctionCloseService,
    private readonly artworkCatalog: ArtworkCatalogService,
    private readonly artworkOwnership: ArtworkOwnershipService,
    private readonly ledgerService: LedgerService,
    private readonly outboxService: OutboxService,
    private readonly clock: Clock,
    @Inject(PAYMENTS_PROVIDER) private readonly paymentsProvider: PaymentsProvider,
  ) {}

  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<WebhookHandlingResult> {
    const event = this.paymentsProvider.verifyWebhook(rawBody, signatureHeader);
    return withSpan('purchases.handle_payment_event', { 'payment.event_id': event.eventId, 'payment.event_type': event.eventType }, () =>
      this.unitOfWork.run(async () => {
        const session = event.kind === 'checkout_session_completed' ? event.session : null;
        const isNew = await this.paymentEventLog.recordIfNew({
          providerEventId: event.eventId,
          eventType: event.eventType,
          providerSessionId: session?.id ?? null,
          claimedPurchaseId: session?.purchaseId ?? null,
          receivedAt: this.clock.now(),
        });
        if (!isNew) return 'duplicate';

        const { outcome, details = {} } = await this.decideAndApply(event);
        await this.paymentEventLog.recordOutcome(event.eventId, outcome, details);
        if (outcome !== 'settled' && outcome !== 'ignored_event_type' && outcome !== 'already_paid') {
          this.logger.error(`payment event ${event.eventId} not settled (${outcome}): ${JSON.stringify(details)}`);
        }
        return outcome;
      }),
    );
  }

  private async decideAndApply(event: VerifiedPaymentEvent): Promise<OutcomeWithDetails> {
    if (event.kind !== 'checkout_session_completed') return { outcome: 'ignored_event_type' };
    const { session } = event;

    const purchaseId = purchaseIdSchema.safeParse(session.purchaseId);
    const purchase = purchaseId.success ? await this.purchaseRepository.lockById(purchaseId.data) : null;
    if (!purchase) return { outcome: 'unknown_purchase', details: { claimedPurchaseId: session.purchaseId } };

    const mismatch = findSessionMismatch(purchase, session);
    if (mismatch) return mismatch;

    await this.settle(purchase);
    return { outcome: 'settled' };
  }

  private async settle(purchase: Purchase): Promise<void> {
    const paidAt = this.clock.now();
    await this.purchaseRepository.markPaid(purchase.id, paidAt);

    const auction = await this.auctionCloseService.getAuctionResultById(purchase.auctionId);
    const [artworkWithArtist] = await this.artworkCatalog.findArtworksByIds([auction.artworkId]);
    if (!artworkWithArtist) throw new InvariantViolationError('A purchase references a missing artwork.', { purchaseId: purchase.id });
    const { artwork, artist } = artworkWithArtist;

    const { split } = await this.ledgerService.recordSale({
      purchaseId: purchase.id,
      memo: `Sale of “${artwork.title}”`,
      hammerPriceCents: purchase.amountCents,
      sellerUserId: auction.sellerUserId,
      artistUserId: artist.userId,
      artistRoyaltyBps: artist.royaltyBps,
    });
    await this.artworkOwnership.transferOwnership({
      artworkId: artwork.id,
      fromUserId: auction.sellerUserId,
      toUserId: purchase.buyerUserId,
    });
    await this.outboxService.recordEvent('PurchasePaid', {
      purchaseId: purchase.id,
      auctionId: auction.auctionId,
      auctionSlug: auction.auctionSlug,
      artworkTitle: artwork.title,
      buyerUserId: purchase.buyerUserId,
      sellerUserId: auction.sellerUserId,
      artistUserId: artist.userId,
      saleType: resolveSaleType(auction.sellerUserId, artist.userId),
      amountCents: purchase.amountCents,
      platformFeeCents: split.platformFeeCents,
      artistRoyaltyCents: split.artistRoyaltyCents,
      sellerProceedsCents: split.sellerProceedsCents,
      paidAt: paidAt.toISOString(),
    });
  }
}

function findSessionMismatch(purchase: Purchase, session: CheckoutSession): OutcomeWithDetails | null {
  if (!decidePurchaseTransition(purchase.status, 'payment_confirmed').isAllowed) {
    return { outcome: 'already_paid', details: { purchaseId: purchase.id } };
  }
  if (session.id !== purchase.providerSessionId) {
    return { outcome: 'session_mismatch', details: { purchaseId: purchase.id, expected: purchase.providerSessionId, received: session.id } };
  }
  if (!session.isPaid) return { outcome: 'not_paid', details: { purchaseId: purchase.id } };
  if (session.amountTotalCents !== purchase.amountCents) {
    return { outcome: 'amount_mismatch', details: { purchaseId: purchase.id, expected: purchase.amountCents, received: session.amountTotalCents } };
  }
  if (session.currency !== purchase.currency) {
    return { outcome: 'currency_mismatch', details: { purchaseId: purchase.id, expected: purchase.currency, received: session.currency } };
  }
  return null;
}
