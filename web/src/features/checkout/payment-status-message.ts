import type { CheckoutStatusView } from '../../shared/api/api-types';
import { formatCents } from '../../shared/format/money';

export interface PaymentStatusMessage {
  readonly headline: string;
  readonly detail: string;
  readonly canPay: boolean;
}

export function describePaymentStatus(view: CheckoutStatusView): PaymentStatusMessage {
  if (view.role === 'seller') {
    return view.status === 'paid'
      ? { headline: 'The buyer has paid', detail: 'Your proceeds are in your earnings.', canPay: false }
      : { headline: 'Awaiting payment', detail: 'The winner has been asked to pay through checkout.', canPay: false };
  }
  const amount = formatCents(view.amountCents);
  return view.status === 'paid'
    ? { headline: `Paid ${amount}`, detail: 'Payment confirmed. The work is now yours.', canPay: false }
    : { headline: `${amount} to pay`, detail: 'Pay securely through Stripe Checkout (test mode).', canPay: true };
}
