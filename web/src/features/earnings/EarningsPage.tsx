import { useApiQuery } from '../../shared/api/use-api-query';
import { formatCents } from '../../shared/format/money';
import { EmptyState, ErrorState, LoadingState } from '../../shared/ui/StatusMessage';
import { useDemoUserId } from '../demo-user/use-demo-user-id';
import { getEarnings } from './earnings-api';

const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const ENTRY_LABELS = { seller_payable: 'Sale proceeds', artist_payable: 'Resale royalty' } as const;

export function EarningsPage() {
  const demoUserId = useDemoUserId();

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">Your account</p>
        <h1 className="page-title">Earnings</h1>
        <p className="section-note">
          Credited when a buyer’s payment is confirmed: your proceeds as a seller, and your royalty when a work of yours is resold.
        </p>
      </header>
      {demoUserId === null ? (
        <EmptyState>Choose a demo user under “Viewing as” to see their earnings.</EmptyState>
      ) : (
        <EarningsSummary demoUserId={demoUserId} />
      )}
    </section>
  );
}

function EarningsSummary({ demoUserId }: { demoUserId: string }) {
  const earnings = useApiQuery(`earnings:${demoUserId}`, getEarnings);

  if (earnings.status === 'loading') return <LoadingState label="Loading your earnings" />;
  if (earnings.status === 'error') return <ErrorState error={earnings.error} />;
  const { sellerProceedsCents, artistRoyaltiesCents, recentEntries } = earnings.data;

  return (
    <>
      <div className="stat-grid earnings-summary">
        <div className="card card--padded">
          <div className="stat__value">{formatCents(sellerProceedsCents)}</div>
          <div className="stat__label">Sale proceeds</div>
        </div>
        <div className="card card--padded">
          <div className="stat__value">{formatCents(artistRoyaltiesCents)}</div>
          <div className="stat__label">Resale royalties</div>
        </div>
      </div>

      <section className="card card--padded" aria-labelledby="earnings-entries-heading">
        <h2 id="earnings-entries-heading" className="card__title">
          Recent credits
        </h2>
        {recentEntries.length === 0 ? (
          <EmptyState>Nothing yet. Credits appear here once a buyer pays.</EmptyState>
        ) : (
          <ul className="earnings-list">
            {recentEntries.map((entry) => (
              <li key={`${entry.purchaseId}-${entry.accountKind}`} className="earnings-list__row">
                <span className="earnings-list__memo">{entry.memo}</span>
                <span className="earnings-list__amount">{formatCents(entry.earnedCents)}</span>
                <span className="earnings-list__meta">
                  <span className="pill">{ENTRY_LABELS[entry.accountKind]}</span>{' '}
                  {dateTimeFormat.format(new Date(entry.postedAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
