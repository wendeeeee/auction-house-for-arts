import Stripe from 'stripe';
import { ErrorCode } from '../../../common/errors';
import { StripePaymentsProvider } from './stripe-payments.provider';

// Offline: constructing the client and verifying signatures make no network calls.
const WEBHOOK_SECRET = 'whsec_unit_test_secret';
const provider = new StripePaymentsProvider({ secretKey: 'sk_test_unit_test_key', webhookSecret: WEBHOOK_SECRET });

const completedEvent = {
  id: 'evt_test_1',
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_1',
      object: 'checkout.session',
      status: 'complete',
      url: null,
      amount_total: 1_234_57,
      currency: 'usd',
      metadata: { purchaseId: '0b7c6c39-2d0e-4c55-9d43-0a4f3d3c9a11' },
      client_reference_id: '0b7c6c39-2d0e-4c55-9d43-0a4f3d3c9a11',
      payment_status: 'paid',
    },
  },
};

/** A Stripe-Signature header computed by the SDK itself, the way Stripe signs a delivery. */
function signedBy(secret: string, payload: string, timestamp?: number): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
}

const invalidSignature = expect.objectContaining({ code: ErrorCode.INVALID_WEBHOOK_SIGNATURE });

describe('StripePaymentsProvider.verifyWebhook', () => {
  const body = JSON.stringify(completedEvent);

  it('accepts a correctly signed checkout.session.completed and maps the session', () => {
    expect(provider.verifyWebhook(Buffer.from(body), signedBy(WEBHOOK_SECRET, body))).toEqual({
      kind: 'checkout_session_completed',
      eventId: 'evt_test_1',
      eventType: 'checkout.session.completed',
      session: {
        id: 'cs_test_1',
        status: 'complete',
        url: null,
        amountTotalCents: 1_234_57,
        currency: 'usd',
        purchaseId: '0b7c6c39-2d0e-4c55-9d43-0a4f3d3c9a11',
        isPaid: true,
      },
    });
  });

  it('passes other event types through without parsing them further', () => {
    const other = JSON.stringify({ ...completedEvent, id: 'evt_test_2', type: 'payment_intent.created' });
    expect(provider.verifyWebhook(Buffer.from(other), signedBy(WEBHOOK_SECRET, other))).toEqual({
      kind: 'other',
      eventId: 'evt_test_2',
      eventType: 'payment_intent.created',
    });
  });

  it('rejects a payload signed with another secret', () => {
    expect(() => provider.verifyWebhook(Buffer.from(body), signedBy('whsec_someone_else', body))).toThrow(invalidSignature);
  });

  it('rejects a payload changed after signing, even by one character', () => {
    const header = signedBy(WEBHOOK_SECRET, body);
    const tampered = body.replace('123457', '1');
    expect(() => provider.verifyWebhook(Buffer.from(tampered), header)).toThrow(invalidSignature);
  });

  it('rejects a body re-serialized with different whitespace: only the raw bytes verify', () => {
    const header = signedBy(WEBHOOK_SECRET, body);
    const reserialized = JSON.stringify(completedEvent, null, 2);
    expect(() => provider.verifyWebhook(Buffer.from(reserialized), header)).toThrow(invalidSignature);
  });

  it('rejects a correctly signed delivery that is too old to be fresh (a replay)', () => {
    const anHourAgoSeconds = Math.floor(Date.now() / 1_000) - 3_600;
    expect(() => provider.verifyWebhook(Buffer.from(body), signedBy(WEBHOOK_SECRET, body, anHourAgoSeconds))).toThrow(
      invalidSignature,
    );
  });

  it('rejects a missing signature header', () => {
    expect(() => provider.verifyWebhook(Buffer.from(body), undefined)).toThrow(invalidSignature);
  });
});
