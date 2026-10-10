import { useState } from 'react';
import { startCheckout } from './checkout-api';

export function PayNowButton({ slug, onStarted }: { slug: string; onStarted?: () => void }) {
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function pay() {
    setIsStarting(true);
    setErrorMessage(null);
    try {
      const checkout = await startCheckout(slug);
      onStarted?.();
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not start checkout.');
      setIsStarting(false);
    }
  }

  return (
    <>
      <button type="button" className="button button--gold" disabled={isStarting} onClick={() => void pay()}>
        {isStarting ? 'Opening checkout…' : 'Pay now'}
      </button>
      {errorMessage && (
        <p className="checkout-error" role="alert">
          {errorMessage}
        </p>
      )}
    </>
  );
}
