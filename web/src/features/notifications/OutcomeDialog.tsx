import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { describeNotification } from './notification-message';
import { useNotifications } from './NotificationsProvider';

/** A native modal `<dialog>`, so the browser handles focus, Escape, and the inert page behind it. */
export function OutcomeDialog() {
  const { arrivals, dismissArrival, markRead } = useNotifications();
  const current = arrivals[0] ?? null;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (current && !dialog.open) dialog.showModal();
    if (!current && dialog.open) dialog.close();
  }, [current]);

  const message = current ? describeNotification(current) : null;

  return (
    <dialog
      ref={dialogRef}
      className="outcome-dialog"
      aria-labelledby="outcome-dialog-title"
      onClose={() => {
        if (current) dismissArrival(current.id);
      }}
    >
      {current && message && (
        <div className="outcome-dialog__body">
          <p className={`mono-label${message.isPositive ? ' mono-label--gold' : ''}`}>{message.label}</p>
          <h2 id="outcome-dialog-title" className="outcome-dialog__title">
            {message.headline}
          </h2>
          <p className="outcome-dialog__detail">{message.detail}</p>
          <div className="button-row">
            <Link
              className={`button${message.isPositive ? ' button--gold' : ''}`}
              to={`/auctions/${current.auctionSlug}`}
              onClick={() => {
                markRead(current.id);
                dialogRef.current?.close();
              }}
            >
              View auction
            </Link>
            <button type="button" className="button button--outline" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
