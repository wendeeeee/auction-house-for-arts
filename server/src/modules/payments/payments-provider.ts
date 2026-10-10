/** Injection token for the active `PaymentsProvider`: Stripe, the unconfigured stand-in, or a fake in tests. */
export const PAYMENTS_PROVIDER = Symbol('PAYMENTS_PROVIDER');

export const PAYMENT_CURRENCY = 'usd';
export type PaymentCurrency = typeof PAYMENT_CURRENCY;

/**
 * `open`: can still be paid. `complete`: paid (or being paid). `expired`: can no longer be paid,
 * so checkout creates a new session. A status the provider adds later is treated as `expired`:
 * a session we do not understand is never handed to a buyer.
 */
export type CheckoutSessionStatus = 'open' | 'complete' | 'expired';

export interface NewCheckoutSession {
  readonly purchaseId: string;
  readonly amountCents: number;
  readonly currency: PaymentCurrency;
  /** Shown on the hosted checkout page. */
  readonly productName: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  /** The same key returns the same session, so a retried or doubled request never makes two. */
  readonly idempotencyKey: string;
}

export interface CheckoutSession {
  readonly id: string;
  readonly status: CheckoutSessionStatus;
  /** The hosted checkout page; null once the session is no longer open. */
  readonly url: string | null;
  /** As reported by the provider; checked against the purchase before anything is credited. */
  readonly amountTotalCents: number | null;
  readonly currency: string | null;
  /** From the session's metadata, set when it was created. */
  readonly purchaseId: string | null;
  readonly isPaid: boolean;
}

/** A webhook whose signature verified. Only the event this app acts on is parsed further. */
export type VerifiedPaymentEvent =
  | {
      readonly kind: 'checkout_session_completed';
      readonly eventId: string;
      readonly eventType: string;
      readonly session: CheckoutSession;
    }
  | { readonly kind: 'other'; readonly eventId: string; readonly eventType: string };

/**
 * The payment provider, behind an interface so tests and CI never reach the network or need keys.
 * Never call it inside a database transaction: it is a network call.
 */
export interface PaymentsProvider {
  createCheckoutSession(request: NewCheckoutSession): Promise<CheckoutSession>;
  retrieveSession(sessionId: string): Promise<CheckoutSession>;
  /**
   * Verifies the signature over the exact bytes received (not re-serialized JSON, which would
   * not match), then parses the event. Throws InvalidWebhookSignatureError.
   */
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): VerifiedPaymentEvent;
}
