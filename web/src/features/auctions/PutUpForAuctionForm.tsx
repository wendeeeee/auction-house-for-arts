import { type FormEvent, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { createAuction } from './auctions-api';
import { AUCTION_DURATIONS, buildCreateAuctionRequest, describeCreateAuctionError } from './create-auction-request';

/** Shown on an artwork's page to its owner. On success, goes straight to the new auction. */
export function PutUpForAuctionForm({ artworkSlug }: { artworkSlug: string }) {
  const navigate = useNavigate();
  const startingId = useId();
  const reserveId = useId();
  const durationId = useId();
  const [startingPriceText, setStartingPriceText] = useState('');
  const [reservePriceText, setReservePriceText] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number>(AUCTION_DURATIONS[2].seconds);
  const [problem, setProblem] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = buildCreateAuctionRequest({
      artworkSlug,
      startingPriceText,
      reservePriceText,
      durationSeconds,
      now: new Date(),
    });
    if (!draft.isValid) {
      setProblem(draft.problem);
      return;
    }

    setIsSubmitting(true);
    setProblem(null);
    try {
      const auction = await createAuction(draft.request);
      void navigate(`/auctions/${auction.slug}`);
    } catch (error) {
      setProblem(describeCreateAuctionError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auction-panel card card--raised seller-form" onSubmit={submit} noValidate>
      <h2 className="seller-form__title">Put up for auction</h2>
      <p className="bid-form__hint">You own this work. Bidders never see the reserve, only whether it is met.</p>

      <div className="seller-form__fields">
        <label className="select-field" htmlFor={startingId}>
          <span className="select-field__label">Starting price ($)</span>
          <input
            id={startingId}
            className="text-input bid-form__input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="250"
            value={startingPriceText}
            onChange={(event) => setStartingPriceText(event.target.value)}
          />
        </label>
        <label className="select-field" htmlFor={reserveId}>
          <span className="select-field__label">Hidden reserve ($, optional)</span>
          <input
            id={reserveId}
            className="text-input bid-form__input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="None"
            value={reservePriceText}
            onChange={(event) => setReservePriceText(event.target.value)}
          />
        </label>
        <label className="select-field" htmlFor={durationId}>
          <span className="select-field__label">Runs for</span>
          <select
            id={durationId}
            className="select-input"
            value={durationSeconds}
            onChange={(event) => setDurationSeconds(Number(event.target.value))}
          >
            {AUCTION_DURATIONS.map((duration) => (
              <option key={duration.seconds} value={duration.seconds}>
                {duration.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="button-row seller-form__actions">
        <button className="button button--gold" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Opening…' : 'Open the auction'}
        </button>
      </div>

      {problem && (
        <div className="bid-message bid-message--error" role="alert">
          <p className="bid-message__detail">{problem}</p>
        </div>
      )}
    </form>
  );
}
