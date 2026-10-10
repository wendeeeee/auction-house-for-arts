import { useEffect, useState } from 'react';

/** The current time, refreshed every second, for countdowns. One timer per component that needs it. */
export function useNow(intervalMilliseconds = 1_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMilliseconds);
    return () => clearInterval(timer);
  }, [intervalMilliseconds]);
  return now;
}
