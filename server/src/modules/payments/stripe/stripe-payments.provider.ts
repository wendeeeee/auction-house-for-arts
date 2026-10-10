import Stripe from 'stripe';
import type { StripeConfig } from '../../../config';
import { CheckoutSession, NewCheckoutSession, PaymentsProvider, VerifiedPaymentEvent } from '../payments-provider';
import { InvalidWebhookSignatureError, PaymentProviderError } from '../payments.errors';
import { toCheckoutSession, toVerifiedPaymentEvent } from './stripe-event-mapping';

/** Bounded, so a slow Stripe never holds a checkout request for long. */
const STRIPE_TIMEOUT_MILLISECONDS = 10_000;
/** The SDK retries only safe cases (connection errors, 409s, 5xx) and resends the idempotency key. */
const STRIPE_NETWORK_RETRIES = 2;

/**
 * Stripe Checkout in test mode. The API version is the one this SDK release is pinned to, so
 * the response shapes match its types.
 */
export class StripePaymentsProvider implements PaymentsProvider {
  private readonly stripe: Stripe;

  constructor(private readonly config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey, {
      timeout: STRIPE_TIMEOUT_MILLISECONDS,
      maxNetworkRetries: STRIPE_NETWORK_RETRIES,
    });
  }

  async createCheckoutSession(request: NewCheckoutSession): Promise<CheckoutSession> {
    try {
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: request.currency,
                unit_amount: request.amountCents,
                product_data: { name: request.productName },
              },
            },
          ],
          // Both carry the purchase ID: metadata is what the webhook reads, the reference is
          // what the Stripe dashboard shows.
          client_reference_id: request.purchaseId,
          metadata: { purchaseId: request.purchaseId },
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
        },
        { idempotencyKey: request.idempotencyKey },
      );
      return toCheckoutSession(session);
    } catch (error) {
      throw new PaymentProviderError('create_checkout_session', error);
    }
  }

  async retrieveSession(sessionId: string): Promise<CheckoutSession> {
    try {
      return toCheckoutSession(await this.stripe.checkout.sessions.retrieve(sessionId));
    } catch (error) {
      throw new PaymentProviderError('retrieve_checkout_session', error);
    }
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): VerifiedPaymentEvent {
    if (!signatureHeader) throw new InvalidWebhookSignatureError('missing Stripe-Signature header');
    let event: Stripe.Event;
    try {
      // Checks the HMAC over the raw bytes and rejects timestamps older than five minutes
      // (the SDK's default tolerance), so a captured webhook cannot be replayed later.
      event = this.stripe.webhooks.constructEvent(rawBody, signatureHeader, this.config.webhookSecret);
    } catch (error) {
      throw new InvalidWebhookSignatureError(error instanceof Error ? error.message : 'signature check failed');
    }
    return toVerifiedPaymentEvent(event);
  }
}
