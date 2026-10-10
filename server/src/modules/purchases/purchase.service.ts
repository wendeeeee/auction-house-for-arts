import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser } from '../../common/identity';
import { withSpan } from '../../common/tracing';
import { APP_CONFIG, AppConfig } from '../../config';
import { UnitOfWork } from '../../database';
import { ArtworkCatalogService } from '../artworks';
import { AuctionCloseService, AuctionResult } from '../closing';
import { CheckoutSession, PAYMENTS_PROVIDER, PAYMENT_CURRENCY, PaymentsProvider } from '../payments';
import { decideCheckoutViewerRole } from './checkout-access';
import { decidePurchaseTransition } from './purchase-transitions';
import { PurchaseRepository } from './purchase.repository';
import {
  AuctionNotSoldError,
  NotAuctionWinnerError,
  NotPurchasePartyError,
  PaymentInProgressError,
  PurchaseAlreadyPaidError,
} from './purchases.errors';
import { CheckoutStatus, Purchase, StartedCheckout } from './purchases.types';

const MAXIMUM_ATTACH_ATTEMPTS = 3;

interface SoldAuction {
  readonly result: AuctionResult;
  readonly winningUserId: string;
  readonly hammerPriceCents: number;
}

@Injectable()
export class PurchaseService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly purchaseRepository: PurchaseRepository,
    private readonly auctionCloseService: AuctionCloseService,
    private readonly artworkCatalog: ArtworkCatalogService,
    private readonly clock: Clock,
    @Inject(PAYMENTS_PROVIDER) private readonly paymentsProvider: PaymentsProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Returns a payable checkout session for the winner, reusing the open one. Calls the provider
   * outside any transaction; the session is attached with a compare-and-set instead of a lock.
   */
  async startCheckout(buyer: AuthenticatedUser, auctionSlug: string): Promise<StartedCheckout> {
    if (this.unitOfWork.isInTransaction) {
      throw new InvariantViolationError('startCheckout calls the payment provider and must not run inside a transaction.');
    }
    return withSpan('purchases.start_checkout', { 'auction.slug': auctionSlug }, async () => {
      const sale = await this.loadSoldAuction(auctionSlug);
      if (sale.winningUserId !== buyer.id) throw new NotAuctionWinnerError(auctionSlug);

      // The amount is the hammer price from the database, fixed when the purchase is created.
      let purchase = await this.purchaseRepository.findOrCreate({
        auctionId: sale.result.auctionId,
        buyerUserId: buyer.id,
        amountCents: sale.hammerPriceCents,
        currency: PAYMENT_CURRENCY,
        createdAt: this.clock.now(),
      });

      for (let attempt = 1; attempt <= MAXIMUM_ATTACH_ATTEMPTS; attempt += 1) {
        if (!decidePurchaseTransition(purchase.status, 'checkout_session_attached').isAllowed) {
          throw new PurchaseAlreadyPaidError(purchase.id);
        }
        const reusable = await this.findReusableSession(purchase);
        if (reusable) return toStartedCheckout(purchase, reusable);

        const session = await this.paymentsProvider.createCheckoutSession({
          purchaseId: purchase.id,
          amountCents: purchase.amountCents,
          currency: purchase.currency,
          productName: await this.describeArtwork(sale.result.artworkId),
          successUrl: this.webUrl(`/auctions/${encodeURIComponent(auctionSlug)}/checkout/success`),
          cancelUrl: this.webUrl(`/auctions/${encodeURIComponent(auctionSlug)}/checkout/cancelled`),
          // Same key for the same step, so concurrent requests get the same session from the provider.
          idempotencyKey: `checkout:${purchase.id}:${purchase.providerSessionId ?? 'first'}`,
        });
        const isAttached = await this.purchaseRepository.attachSession(purchase.id, purchase.providerSessionId, session.id);
        const current = await this.purchaseRepository.findById(purchase.id);
        if (!current) throw new InvariantViolationError('A purchase disappeared during checkout.', { purchaseId: purchase.id });
        if (isAttached || current.providerSessionId === session.id) return toStartedCheckout(current, session);
        purchase = current;
      }
      throw new InvariantViolationError('Could not attach a checkout session after several attempts.', { purchaseId: purchase.id });
    });
  }

  /** By auction ID, for the buyer's own won auctions. An auction without a purchase row has not been paid. */
  async findPaymentStatusesByAuctionIds(auctionIds: readonly string[]): Promise<Map<string, 'awaiting_payment' | 'paid'>> {
    const purchases = await this.purchaseRepository.findByAuctionIds(auctionIds);
    return new Map(purchases.map((purchase) => [purchase.auctionId, purchase.status === 'paid' ? 'paid' : 'awaiting_payment']));
  }

  async getCheckoutStatus(viewer: AuthenticatedUser, auctionSlug: string): Promise<CheckoutStatus> {
    const sale = await this.loadSoldAuction(auctionSlug);
    const role = decideCheckoutViewerRole({
      viewerUserId: viewer.id,
      winningUserId: sale.winningUserId,
      sellerUserId: sale.result.sellerUserId,
    });
    if (role === 'none') throw new NotPurchasePartyError(auctionSlug);

    const purchase = await this.purchaseRepository.findByAuctionId(sale.result.auctionId);
    const status = purchase?.status === 'paid' ? 'paid' : 'awaiting_payment';
    if (role === 'seller') return { role, status };
    return {
      role,
      status,
      purchaseId: purchase?.id ?? null,
      amountCents: purchase?.amountCents ?? sale.hammerPriceCents,
      currency: PAYMENT_CURRENCY,
      paidAt: purchase?.paidAt ?? null,
    };
  }

  private async loadSoldAuction(auctionSlug: string): Promise<SoldAuction> {
    const result = await this.auctionCloseService.getAuctionResultBySlug(auctionSlug);
    const close = result.close;
    if (close?.outcome !== 'sold' || close.winningUserId === null || close.hammerPriceCents === null) {
      throw new AuctionNotSoldError({ auctionSlug, outcome: close?.outcome ?? 'not_closed' });
    }
    return { result, winningUserId: close.winningUserId, hammerPriceCents: close.hammerPriceCents };
  }

  private async findReusableSession(purchase: Purchase): Promise<CheckoutSession | null> {
    if (purchase.providerSessionId === null) return null;
    const session = await this.paymentsProvider.retrieveSession(purchase.providerSessionId);
    if (session.status === 'complete') throw new PaymentInProgressError(purchase.id);
    return session.status === 'open' && session.url !== null ? session : null;
  }

  private async describeArtwork(artworkId: string): Promise<string> {
    const [artwork] = await this.artworkCatalog.findArtworksByIds([artworkId]);
    if (!artwork) throw new InvariantViolationError('An auction references a missing artwork.', { artworkId });
    return `${artwork.artwork.title} by ${artwork.artist.name}`;
  }

  private webUrl(path: string): string {
    return `${this.config.web.baseUrl}${path}`;
  }
}

function toStartedCheckout(purchase: Purchase, session: CheckoutSession): StartedCheckout {
  if (session.url === null) {
    throw new InvariantViolationError('A checkout session has no URL.', { purchaseId: purchase.id, sessionId: session.id });
  }
  return { purchaseId: purchase.id, amountCents: purchase.amountCents, currency: purchase.currency, checkoutUrl: session.url };
}
