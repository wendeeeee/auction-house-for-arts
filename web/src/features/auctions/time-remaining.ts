export interface TimeRemaining {
  readonly hasEnded: boolean;
  /** `"2d 3h"`, `"1h 05m"`, `"4m 09s"`, `"9s"`, or `"Ended"`. */
  readonly label: string;
  /** Under five minutes: shown with urgency. */
  readonly isEndingSoon: boolean;
}

const ENDING_SOON_SECONDS = 5 * 60;
const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * The countdown text. Pure, so it is tested without timers. Seconds round up, so "1s" shows
 * until the instant the auction ends, matching the server's rule that a bid at `ends_at` is late.
 */
export function describeTimeRemaining(endsAt: Date, now: Date): TimeRemaining {
  const remainingMilliseconds = endsAt.getTime() - now.getTime();
  if (remainingMilliseconds <= 0) return { hasEnded: true, label: 'Ended', isEndingSoon: false };

  const totalSeconds = Math.ceil(remainingMilliseconds / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  let label: string;
  if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${pad(minutes)}m`;
  else if (minutes > 0) label = `${minutes}m ${pad(seconds)}s`;
  else label = `${seconds}s`;

  return { hasEnded: false, label, isEndingSoon: totalSeconds <= ENDING_SOON_SECONDS };
}
