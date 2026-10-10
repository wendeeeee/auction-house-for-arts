import { CheckoutSession, PaymentsProvider, VerifiedPaymentEvent } from './payments-provider';
import { PaymentsUnavailableError } from './payments.errors';

/** Stands in when no Stripe keys are set, so the app boots and only payment routes answer 503. */
export class UnconfiguredPaymentsProvider implements PaymentsProvider {
  createCheckoutSession(): Promise<CheckoutSession> {
    return Promise.reject(new PaymentsUnavailableError());
  }

  retrieveSession(): Promise<CheckoutSession> {
    return Promise.reject(new PaymentsUnavailableError());
  }

  verifyWebhook(): VerifiedPaymentEvent {
    throw new PaymentsUnavailableError();
  }
}
