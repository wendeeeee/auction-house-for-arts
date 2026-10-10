import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useApiQuery } from '../../shared/api/use-api-query';
import { ErrorState, LoadingState } from '../../shared/ui/StatusMessage';
import { useDemoUserId } from '../demo-user/use-demo-user-id';
import { getCheckoutStatus } from './checkout-api';
import { CHECKOUT_POLL_INTERVAL_MILLISECONDS, decideCheckoutPoll } from './checkout-polling';
import { PayNowButton } from './PayNowButton';
import { describePaymentStatus } from './payment-status-message';

export function CheckoutReturnPage({ result }: { result: 'success' | 'cancelled' }) {
  const { slug = '' } = useParams();
  const demoUserId = useDemoUserId();
  const [round, setRound] = useState(0);
  const [completedPolls, setCompletedPolls] = useState(0);
  const checkout = useApiQuery(`checkout-return:${slug}:${demoUserId ?? 'anonymous'}:${round}:${completedPolls}`, (signal) =>
    getCheckoutStatus(slug, signal),
  );

  const decision =
    checkout.status === 'success' ? decideCheckoutPoll(checkout.data.status, result === 'success' ? completedPolls : Infinity) : null;

  useEffect(() => {
    if (decision !== 'poll_again') return;
    const timer = setTimeout(() => setCompletedPolls((count) => count + 1), CHECKOUT_POLL_INTERVAL_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [decision, completedPolls]);

  const backToAuction = (
    <Link className="text-link" to={`/auctions/${encodeURIComponent(slug)}`}>
      Back to the auction
    </Link>
  );

  if (demoUserId === null) {
    return (
      <section className="page page--narrow">
        <h1 className="page-title">Choose who you are</h1>
        <p>Pick the winning bidder under “Viewing as” to see this payment.</p>
      </section>
    );
  }
  if (checkout.status === 'error') return <ErrorState error={checkout.error}>{backToAuction}</ErrorState>;
  if (checkout.status === 'loading' && completedPolls === 0) return <LoadingState label="Checking your payment" />;

  const isPaid = checkout.status === 'success' && checkout.data.status === 'paid';
  const message = checkout.status === 'success' ? describePaymentStatus(checkout.data) : null;

  return (
    <section className="page page--narrow">
      <p className="eyebrow">Checkout</p>
      {isPaid && message && (
        <div role="status">
          <h1 className="page-title">Payment confirmed</h1>
          <p>{message.headline}. The work is now yours.</p>
        </div>
      )}
      {!isPaid && result === 'success' && decision !== 'gave_up' && (
        <div role="status" aria-live="polite">
          <h1 className="page-title">Confirming your payment…</h1>
          <p>Stripe is confirming the payment with us. This usually takes a few seconds.</p>
        </div>
      )}
      {!isPaid && result === 'success' && decision === 'gave_up' && (
        <div role="status">
          <h1 className="page-title">Still confirming</h1>
          <p>We have not received Stripe’s confirmation yet. It is safe to leave this page; the auction page shows the status.</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--outline"
              onClick={() => {
                setCompletedPolls(0);
                setRound((count) => count + 1);
              }}
            >
              Check again
            </button>
          </div>
        </div>
      )}
      {!isPaid && result === 'cancelled' && message && (
        <div>
          <h1 className="page-title">Payment cancelled</h1>
          <p>Nothing was charged. {message.headline}; you can pay whenever you are ready.</p>
          {message.canPay && (
            <div className="button-row">
              <PayNowButton slug={slug} />
            </div>
          )}
        </div>
      )}
      <p>{backToAuction}</p>
    </section>
  );
}
