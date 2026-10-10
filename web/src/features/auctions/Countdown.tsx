import { describeTimeRemaining } from './time-remaining';
import { useNow } from './use-now';

/**
 * Time left until `endsAt`. Driven by the `endsAt` it is given, so when a refetch brings a
 * soft-close extension, the countdown jumps to the new end.
 */
export function Countdown({ endsAt }: { endsAt: string }) {
  const now = useNow();
  const remaining = describeTimeRemaining(new Date(endsAt), now);
  return (
    // No aria-live: announcing every second would drown out everything else.
    <time
      dateTime={endsAt}
      className={`countdown${remaining.isEndingSoon ? ' countdown--ending-soon' : ''}`}
      title={new Date(endsAt).toLocaleString()}
    >
      {remaining.label}
    </time>
  );
}
