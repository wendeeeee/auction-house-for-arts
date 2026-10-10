import { createHmac, timingSafeEqual } from 'node:crypto';
import { CheckoutSession, NewCheckoutSession, PaymentsProvider, VerifiedPaymentEvent } from './payments-provider';
import { InvalidWebhookSignatureError, PaymentProviderError } from './payments.errors';
import {
  CHECKOUT_SESSION_COMPLETED,
  StripeCheckoutSessionFields,
  StripeEventFields,
  toCheckoutSession,
  toVerifiedPaymentEvent,
} from './stripe/stripe-event-mapping';

const FAKE_WEBHOOK_SECRET = 'whsec_fake_payments_provider';

interface FakeSession {
  readonly request: NewCheckoutSession;
  fields: StripeCheckoutSessionFields;
}

export interface SignedWebhook {
  readonly body: string;
  readonly signatureHeader: string;
}

/**
 * An in-memory provider for tests and CI: no keys, no network. Sessions and events have
 * Stripe's shape and pass through the same mapping as the real adapter, and webhooks are signed
 * with an HMAC so the signature check is exercised for real.
 */
export class FakePaymentsProvider implements PaymentsProvider {
  readonly createRequests: NewCheckoutSession[] = [];
  private readonly sessions = new Map<string, FakeSession>();
  private readonly sessionIdsByIdempotencyKey = new Map<string, string>();
  private sessionCount = 0;
  private eventCount = 0;
  private failingOperation: 'create' | 'retrieve' | null = null;

  async createCheckoutSession(request: NewCheckoutSession): Promise<CheckoutSession> {
    this.createRequests.push(request);
    if (this.failingOperation === 'create') throw new PaymentProviderError('create_checkout_session', new Error('fake outage'));

    // Like Stripe: a repeated idempotency key returns the original session, whatever its state.
    const existingId = this.sessionIdsByIdempotencyKey.get(request.idempotencyKey);
    if (existingId !== undefined) return this.retrieveSession(existingId);

    this.sessionCount += 1;
    const id = `cs_test_fake_${this.sessionCount}`;
    this.sessions.set(id, {
      request,
      fields: {
        id,
        status: 'open',
        url: `https://checkout.fake.test/pay/${id}`,
        amount_total: request.amountCents,
        currency: request.currency,
        metadata: { purchaseId: request.purchaseId },
        client_reference_id: request.purchaseId,
        payment_status: 'unpaid',
      },
    });
    this.sessionIdsByIdempotencyKey.set(request.idempotencyKey, id);
    return toCheckoutSession(this.sessions.get(id)!.fields);
  }

  async retrieveSession(sessionId: string): Promise<CheckoutSession> {
    if (this.failingOperation === 'retrieve') {
      throw new PaymentProviderError('retrieve_checkout_session', new Error('fake outage'));
    }
    return toCheckoutSession(this.sessionFields(sessionId));
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): VerifiedPaymentEvent {
    if (!signatureHeader) throw new InvalidWebhookSignatureError('missing Stripe-Signature header');
    const expected = Buffer.from(sign(rawBody.toString('utf8')));
    const received = Buffer.from(signatureHeader);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new InvalidWebhookSignatureError('signature does not match the payload');
    }
    return toVerifiedPaymentEvent(JSON.parse(rawBody.toString('utf8')) as StripeEventFields);
  }

  // Test controls -------------------------------------------------------------------------------

  /** The buyer let the session lapse (Stripe expires them after 24 hours). */
  expireSession(sessionId: string): void {
    this.updateSession(sessionId, { status: 'expired', url: null });
  }

  /** The buyer paid on the hosted page. Returns the `checkout.session.completed` webhook Stripe would send. */
  completeSession(sessionId: string): SignedWebhook {
    this.updateSession(sessionId, { status: 'complete', url: null, payment_status: 'paid' });
    return this.signEvent(CHECKOUT_SESSION_COMPLETED, this.sessionFields(sessionId));
  }

  /** Any event, with any session fields: for mismatched amounts, unknown purchases, and the like. */
  signEvent(type: string, object: unknown, eventId?: string): SignedWebhook {
    this.eventCount += 1;
    const event: StripeEventFields = { id: eventId ?? `evt_fake_${this.eventCount}`, type, data: { object } };
    const body = JSON.stringify(event);
    return { body, signatureHeader: sign(body) };
  }

  sessionFields(sessionId: string): StripeCheckoutSessionFields {
    const session = this.sessions.get(sessionId);
    if (!session) throw new PaymentProviderError('retrieve_checkout_session', new Error(`No such session: ${sessionId}`));
    return { ...session.fields };
  }

  setFailingOperation(operation: 'create' | 'retrieve' | null): void {
    this.failingOperation = operation;
  }

  reset(): void {
    this.createRequests.length = 0;
    this.sessions.clear();
    this.sessionIdsByIdempotencyKey.clear();
    this.failingOperation = null;
  }

  private updateSession(sessionId: string, changes: Partial<StripeCheckoutSessionFields>): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`No such fake session: ${sessionId}`);
    session.fields = { ...session.fields, ...changes };
  }
}

function sign(body: string): string {
  return `sha256=${createHmac('sha256', FAKE_WEBHOOK_SECRET).update(body).digest('hex')}`;
}
