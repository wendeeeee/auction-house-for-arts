import { DomainError, ErrorCode } from '../../common/errors';

/** No Stripe keys are configured. Checkout is off; the rest of the app is unaffected. */
export class PaymentsUnavailableError extends DomainError {
  readonly code = ErrorCode.PAYMENTS_UNAVAILABLE;
  readonly httpStatus = 503;

  constructor() {
    super('Payments are not configured on this server. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable checkout.');
  }
}

/** The webhook did not come from the provider, or was altered: reject before reading anything in it. */
export class InvalidWebhookSignatureError extends DomainError {
  readonly code = ErrorCode.INVALID_WEBHOOK_SIGNATURE;
  readonly httpStatus = 400;

  constructor(reason: string) {
    super('The webhook signature could not be verified.', { reason });
  }
}

/** The provider failed or was unreachable. The provider's own message goes to the log (as the cause), not to the client. */
export class PaymentProviderError extends DomainError {
  readonly code = ErrorCode.PAYMENT_PROVIDER_ERROR;
  readonly httpStatus = 502;

  constructor(operation: string, cause: unknown) {
    super('The payment provider could not complete the request. Please try again.', { operation }, { cause });
  }
}
