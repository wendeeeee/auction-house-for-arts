import type { ReactNode } from 'react';
import { ApiError } from '../api/api-error';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="status-message" role="status" aria-live="polite">
      {label}…
    </p>
  );
}

/** Shows what went wrong and, for server errors, the reference to quote when reporting it. */
export function ErrorState({ error, children }: { error: unknown; children?: ReactNode }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const correlationId = error instanceof ApiError ? error.correlationId : null;
  return (
    <div className="status-message status-message--error" role="alert">
      <p>{message}</p>
      {correlationId && <p className="status-message__reference">Reference: {correlationId}</p>}
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="status-message">{children}</p>;
}
