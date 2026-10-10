import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config';
import { PaymentEventLog } from './payment-event-log.service';
import { PaymentEventRepository } from './payment-event.repository';
import { PAYMENTS_PROVIDER, PaymentsProvider } from './payments-provider';
import { StripePaymentsProvider } from './stripe/stripe-payments.provider';
import { UnconfiguredPaymentsProvider } from './unconfigured-payments.provider';

/** Stripe when its keys are configured; otherwise a stand-in whose every call answers 503. */
export function createPaymentsProvider(config: AppConfig): PaymentsProvider {
  return config.payments.stripe === null
    ? new UnconfiguredPaymentsProvider()
    : new StripePaymentsProvider(config.payments.stripe);
}

@Module({
  providers: [
    { provide: PAYMENTS_PROVIDER, useFactory: createPaymentsProvider, inject: [APP_CONFIG] },
    PaymentEventRepository,
    PaymentEventLog,
  ],
  exports: [PAYMENTS_PROVIDER, PaymentEventLog],
})
export class PaymentsModule {}
