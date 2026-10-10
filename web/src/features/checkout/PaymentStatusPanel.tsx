import { isApiErrorWithCode } from '../../shared/api/api-error';
import { useApiQuery } from '../../shared/api/use-api-query';
import { useDemoUserId } from '../demo-user/use-demo-user-id';
import { getCheckoutStatus } from './checkout-api';
import { PayNowButton } from './PayNowButton';
import { describePaymentStatus } from './payment-status-message';

/** For the buyer and the seller of a sold auction; renders nothing for anyone else. */
export function PaymentStatusPanel({ slug, refreshKey }: { slug: string; refreshKey: number }) {
  const demoUserId = useDemoUserId();
  const checkout = useApiQuery(`checkout:${slug}:${demoUserId ?? 'anonymous'}:${refreshKey}`, (signal) =>
    getCheckoutStatus(slug, signal),
  );

  if (demoUserId === null || checkout.status === 'loading') return null;
  if (checkout.status === 'error') {
    if (isApiErrorWithCode(checkout.error, 'NOT_PURCHASE_PARTY')) return null;
    return (
      <p className="checkout-error" role="alert">
        Could not load the payment status.
      </p>
    );
  }

  const message = describePaymentStatus(checkout.data);
  return (
    <div className="payment-status">
      <p className="mono-label mono-label--gold">Payment</p>
      <p className="payment-status__headline">{message.headline}</p>
      <p className="auction-outcome__note">{message.detail}</p>
      {message.canPay && (
        <div className="button-row payment-status__actions">
          <PayNowButton slug={slug} />
        </div>
      )}
    </div>
  );
}
