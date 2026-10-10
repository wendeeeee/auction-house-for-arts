import { ErrorCode } from '../../common/errors';
import { loadConfiguration } from '../../config';
import { createPaymentsProvider } from './payments.module';
import { StripePaymentsProvider } from './stripe/stripe-payments.provider';
import { UnconfiguredPaymentsProvider } from './unconfigured-payments.provider';

const DATABASE_URL = 'postgres://art_auction:art_auction@localhost:55442/art_auction';

describe('createPaymentsProvider', () => {
  it('uses Stripe when both keys are configured', () => {
    const config = loadConfiguration({ DATABASE_URL, STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example' });
    expect(createPaymentsProvider(config)).toBeInstanceOf(StripePaymentsProvider);
  });

  it('without keys, every payment call answers PAYMENTS_UNAVAILABLE (503) instead of failing at boot', async () => {
    const provider = createPaymentsProvider(loadConfiguration({ DATABASE_URL }));
    const unavailable = expect.objectContaining({ code: ErrorCode.PAYMENTS_UNAVAILABLE, httpStatus: 503 });

    expect(provider).toBeInstanceOf(UnconfiguredPaymentsProvider);
    await expect(provider.retrieveSession('cs_test_1')).rejects.toEqual(unavailable);
    await expect(
      provider.createCheckoutSession({
        purchaseId: 'p',
        amountCents: 1,
        currency: 'usd',
        productName: 'x',
        successUrl: 'http://localhost/s',
        cancelUrl: 'http://localhost/c',
        idempotencyKey: 'k',
      }),
    ).rejects.toEqual(unavailable);
    expect(() => provider.verifyWebhook(Buffer.from('{}'), 'sig')).toThrow(unavailable);
  });
});
