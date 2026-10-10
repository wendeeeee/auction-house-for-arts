import { type FormEvent, useId, useState } from 'react';
import type { AuctionDetailView, PlaceMaximumBidResultView } from '../../shared/api/api-types';
import { formatCents, parseDollarsToCents } from '../../shared/format/money';
import { type BidMessage, describeBidOutcome, describeBidRejection } from './bid-outcome-message';
import { placeMaximumBid } from './auctions-api';

interface MaximumBidFormProps {
  readonly auction: AuctionDetailView;
  /** Called after an accepted bid, so the page refetches the full state. */
  readonly onBidPlaced: (result: PlaceMaximumBidResultView) => void;
}

/**
 * "Your maximum bid". The bidder enters the most they would pay; the server decides the price.
 * Amounts are not checked against the minimum here: the server is the one place that rule
 * lives, and its BID_TOO_LOW answer carries the minimum to show.
 */
export function MaximumBidForm({ auction, onBidPlaced }: MaximumBidFormProps) {
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<BidMessage | null>(null);

  const hint =
    auction.youAreLeading && auction.yourMaxBidCents !== null
      ? `You’re leading with a maximum of ${formatCents(auction.yourMaxBidCents)}. Enter more to raise it.`
      : `Enter ${formatCents(auction.minimumNextBidCents)} or more.`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const maxBidCents = parseDollarsToCents(draft);
    if (maxBidCents === null || maxBidCents <= 0) {
      setMessage({ tone: 'error', title: 'Enter a dollar amount.', detail: 'For example 450 or 450.50.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = await placeMaximumBid(auction.slug, maxBidCents);
      setMessage(describeBidOutcome(result));
      setDraft('');
      onBidPlaced(result);
    } catch (error) {
      setMessage(describeBidRejection(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="bid-form" onSubmit={submit} noValidate>
      <label className="bid-form__label" htmlFor={inputId}>
        Your maximum bid
      </label>
      <div className="bid-form__row">
        <span className="bid-form__currency" aria-hidden="true">
          $
        </span>
        <input
          id={inputId}
          className="text-input bid-form__input"
          inputMode="decimal"
          autoComplete="off"
          placeholder={formatCents(auction.minimumNextBidCents).replace('$', '')}
          aria-describedby={hintId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="button button--gold" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Placing…' : auction.youAreLeading ? 'Raise maximum' : 'Place bid'}
        </button>
      </div>
      <p id={hintId} className="bid-form__hint">
        {hint} We bid for you only as much as needed to lead. Others never see your maximum.
      </p>

      {message && (
        <div
          className={`bid-message bid-message--${message.tone}`}
          role={message.tone === 'error' ? 'alert' : 'status'}
        >
          <p className="bid-message__title">{message.title}</p>
          <p className="bid-message__detail">{message.detail}</p>
        </div>
      )}
    </form>
  );
}
