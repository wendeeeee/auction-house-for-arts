import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatCents } from '../../shared/format/money';
import { realtimeConnection } from '../../shared/realtime/realtime-client';
import type { UserOutbidEvent } from '../../shared/realtime/realtime-events';
import { CloseIcon } from '../../shared/ui/icons';

const VISIBLE_MILLISECONDS = 8_000;
/** Older alerts give way, so a bidding war on several lots cannot cover the page. */
const MAXIMUM_VISIBLE_TOASTS = 3;

interface OutbidToast extends UserOutbidEvent {
  readonly id: number;
}

/**
 * "You've been outbid" alerts, on every page (rendered by AppLayout). The live region is
 * always in the DOM, so screen readers announce each alert as it is added.
 */
export function OutbidToasts() {
  const [toasts, setToasts] = useState<readonly OutbidToast[]>([]);

  useEffect(() => {
    let nextId = 0;
    return realtimeConnection.onOutbid((event) => {
      nextId += 1;
      const toast = { ...event, id: nextId };
      setToasts((current) => [toast, ...current].slice(0, MAXIMUM_VISIBLE_TOASTS));
    });
  }, []);

  const dismiss = (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id));

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <OutbidToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function OutbidToastCard({ toast, onDismiss }: { toast: OutbidToast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, VISIBLE_MILLISECONDS);
    return () => clearTimeout(timer);
    // onDismiss is recreated every render; the timer belongs to this toast only.
  }, [toast.id]);

  return (
    <div className="toast">
      <div className="toast__body">
        <p className="mono-label mono-label--gold">Outbid</p>
        <p className="toast__message">
          You’ve been outbid on{' '}
          <Link className="toast__link" to={`/auctions/${toast.slug}`} onClick={onDismiss}>
            {toast.artworkTitle}
          </Link>
          . Current bid <span className="toast__amount">{formatCents(toast.priceCents)}</span>
        </p>
      </div>
      <button type="button" className="toast__close" aria-label="Dismiss alert" onClick={onDismiss}>
        <CloseIcon />
      </button>
    </div>
  );
}
