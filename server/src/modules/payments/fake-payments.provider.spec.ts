import { ErrorCode } from '../../common/errors';
import { FakePaymentsProvider } from './fake-payments.provider';
import { NewCheckoutSession } from './payments-provider';

const PURCHASE_ID = '0b7c6c39-2d0e-4c55-9d43-0a4f3d3c9a11';

const request = (overrides: Partial<NewCheckoutSession> = {}): NewCheckoutSession => ({
  purchaseId: PURCHASE_ID,
  amountCents: 500_00,
  currency: 'usd',
  productName: 'Harbour',
  successUrl: 'http://localhost:5201/success',
  cancelUrl: 'http://localhost:5201/cancel',
  idempotencyKey: `${PURCHASE_ID}:first`,
  ...overrides,
});

describe('FakePaymentsProvider', () => {
  let provider: FakePaymentsProvider;

  beforeEach(() => {
    provider = new FakePaymentsProvider();
  });

  it('creates an open session that carries the purchase and amount', async () => {
    const session = await provider.createCheckoutSession(request());
    expect(session).toEqual({
      id: expect.stringMatching(/^cs_test_fake_/),
      status: 'open',
      url: expect.stringContaining(session.id),
      amountTotalCents: 500_00,
      currency: 'usd',
      purchaseId: PURCHASE_ID,
      isPaid: false,
    });
  });

  it('returns the same session for a repeated idempotency key, like Stripe', async () => {
    const first = await provider.createCheckoutSession(request());
    const repeat = await provider.createCheckoutSession(request());
    const another = await provider.createCheckoutSession(request({ idempotencyKey: `${PURCHASE_ID}:${first.id}` }));

    expect(repeat.id).toBe(first.id);
    expect(another.id).not.toBe(first.id);
  });

  it('expires and completes sessions on request', async () => {
    const expiring = await provider.createCheckoutSession(request());
    provider.expireSession(expiring.id);
    expect(await provider.retrieveSession(expiring.id)).toMatchObject({ status: 'expired', url: null, isPaid: false });

    const paying = await provider.createCheckoutSession(request({ idempotencyKey: 'second' }));
    provider.completeSession(paying.id);
    expect(await provider.retrieveSession(paying.id)).toMatchObject({ status: 'complete', isPaid: true });
  });

  it('signs the completion webhook so that it verifies, and maps it like the Stripe adapter', async () => {
    const session = await provider.createCheckoutSession(request());
    const webhook = provider.completeSession(session.id);

    expect(provider.verifyWebhook(Buffer.from(webhook.body), webhook.signatureHeader)).toMatchObject({
      kind: 'checkout_session_completed',
      eventId: expect.stringMatching(/^evt_fake_/),
      session: { id: session.id, amountTotalCents: 500_00, currency: 'usd', purchaseId: PURCHASE_ID, isPaid: true },
    });
  });

  it('rejects a webhook whose body was changed after signing', async () => {
    const session = await provider.createCheckoutSession(request());
    const webhook = provider.completeSession(session.id);
    const tampered = webhook.body.replace('50000', '1');

    expect(() => provider.verifyWebhook(Buffer.from(tampered), webhook.signatureHeader)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_WEBHOOK_SIGNATURE }),
    );
    expect(() => provider.verifyWebhook(Buffer.from(webhook.body), undefined)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_WEBHOOK_SIGNATURE }),
    );
  });

  it('can simulate a provider outage', async () => {
    provider.setFailingOperation('create');
    await expect(provider.createCheckoutSession(request())).rejects.toMatchObject({ code: ErrorCode.PAYMENT_PROVIDER_ERROR });
  });
});
