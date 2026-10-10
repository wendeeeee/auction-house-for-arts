import { useEffect, useRef, useState } from 'react';
import type { AuctionOutcomeView } from '../../shared/api/api-types';
import { useApiQuery } from '../../shared/api/use-api-query';
import { formatCents } from '../../shared/format/money';
import { useDemoUserId } from '../demo-user/use-demo-user-id';
import { getAuctionOutcome } from './auctions-api';

// Covers a missed `auction:closed` signal while the result is being recorded.
const PENDING_RECHECK_MILLISECONDS = 3_000;

export function AuctionOutcomePanel({ slug, refreshKey }: { slug: string; refreshKey: number }) {
  const demoUserId = useDemoUserId();
  const [recheckCount, setRecheckCount] = useState(0);
  const outcome = useApiQuery(`outcome:${slug}:${demoUserId ?? 'anonymous'}:${refreshKey}:${recheckCount}`, (signal) =>
    getAuctionOutcome(slug, signal),
  );

  const lastLoaded = useRef<{ slug: string; view: AuctionOutcomeView } | null>(null);
  if (outcome.status === 'success') lastLoaded.current = { slug, view: outcome.data };
  const shown = lastLoaded.current?.slug === slug ? lastLoaded.current.view : null;

  const isPending = outcome.status === 'success' && !outcome.data.isClosed;
  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setRecheckCount((count) => count + 1), PENDING_RECHECK_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [isPending, recheckCount]);

  if (shown === null || !shown.isClosed) {
    return (
      <div className="auction-outcome" role="status">
        <p className="mono-label">Bidding has ended</p>
        <p className="auction-outcome__headline">Recording the result…</p>
      </div>
    );
  }

  return (
    <div className={`auction-outcome${shown.outcome === 'sold' ? ' auction-outcome--sold' : ''}`} role="status">
      {shown.outcome === 'sold' && (
        <>
          <p className="mono-label mono-label--gold">Sold</p>
          <p className="auction-outcome__headline">
            Sold for <span className="auction-outcome__amount">{formatCents(shown.hammerPriceCents ?? 0)}</span>
            {shown.winnerHandle && (
              <>
                {' '}
                to <span className="auction-panel__handle">{shown.winnerHandle}</span>
              </>
            )}
          </p>
          {shown.youWon && (
            <p className="auction-outcome__note">You won this lot. Payment will open here once checkout is available.</p>
          )}
        </>
      )}
      {shown.outcome === 'reserve_not_met' && (
        <>
          <p className="mono-label">Reserve not met</p>
          <p className="auction-outcome__headline">Not sold</p>
          <p className="auction-outcome__note">The highest bid did not reach the seller’s reserve price.</p>
        </>
      )}
      {shown.outcome === 'no_bids' && (
        <>
          <p className="mono-label">No bids</p>
          <p className="auction-outcome__headline">Not sold</p>
          <p className="auction-outcome__note">This lot closed without any bids.</p>
        </>
      )}
    </div>
  );
}
