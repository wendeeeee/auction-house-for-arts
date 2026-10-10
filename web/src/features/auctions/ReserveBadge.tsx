import type { ReserveStatus } from '../../shared/api/api-types';

const LABELS: Record<ReserveStatus, string> = {
  none: 'No reserve',
  not_met: 'Reserve not met',
  met: 'Reserve met',
};

/** The only thing anyone learns about a reserve: whether there is one, and whether it is met. */
export function ReserveBadge({ reserveStatus }: { reserveStatus: ReserveStatus }) {
  return <span className={`pill pill--reserve-${reserveStatus.replace('_', '-')}`}>{LABELS[reserveStatus]}</span>;
}
