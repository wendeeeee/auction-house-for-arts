import type Stripe from 'stripe';
import { CheckoutSession, CheckoutSessionStatus, VerifiedPaymentEvent } from '../payments-provider';

export const CHECKOUT_SESSION_COMPLETED = 'checkout.session.completed';

/** The fields of a Checkout Session this app reads. */
export type StripeCheckoutSessionFields = Pick<
  Stripe.Checkout.Session,
  'id' | 'status' | 'url' | 'amount_total' | 'currency' | 'metadata' | 'client_reference_id' | 'payment_status'
>;

/** The fields of an event this app reads. */
export interface StripeEventFields {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly object: unknown };
}

/** Pure: maps Stripe's shape to the provider-neutral one. Shared by the Stripe adapter and the fake. */
export function toCheckoutSession(session: StripeCheckoutSessionFields): CheckoutSession {
  return {
    id: session.id,
    status: toCheckoutSessionStatus(session.status),
    url: session.url,
    amountTotalCents: session.amount_total,
    currency: session.currency,
    purchaseId: session.metadata?.purchaseId ?? session.client_reference_id ?? null,
    isPaid: session.payment_status === 'paid',
  };
}

export function toVerifiedPaymentEvent(event: StripeEventFields): VerifiedPaymentEvent {
  if (event.type === CHECKOUT_SESSION_COMPLETED) {
    return {
      kind: 'checkout_session_completed',
      eventId: event.id,
      eventType: event.type,
      session: toCheckoutSession(event.data.object as StripeCheckoutSessionFields),
    };
  }
  return { kind: 'other', eventId: event.id, eventType: event.type };
}

function toCheckoutSessionStatus(status: string | null): CheckoutSessionStatus {
  if (status === 'open' || status === 'complete') return status;
  return 'expired';
}
