import { useEffect, useRef } from 'react';
import { createRefetchCoalescer } from '../../shared/realtime/refetch-coalescer';
import { realtimeConnection } from '../../shared/realtime/realtime-client';

/**
 * Keeps an auction page live: watches `auction:{slug}` while mounted, and calls `refetch`
 * (at most once per burst) when the auction changes or the connection comes back.
 * The page refetches the detail rather than applying the event, so what it shows is always
 * the server's full state for this viewer (their own maximum, the leader, the history).
 */
export function useLiveAuction(slug: string, refetch: () => void): void {
  // The latest callback, without re-watching the room on every render.
  const latestRefetch = useRef(refetch);
  latestRefetch.current = refetch;

  useEffect(() => {
    const coalescer = createRefetchCoalescer(() => latestRefetch.current());
    const unwatch = realtimeConnection.watchAuction(slug, () => coalescer.request());
    return () => {
      unwatch();
      coalescer.cancel();
    };
  }, [slug]);
}
