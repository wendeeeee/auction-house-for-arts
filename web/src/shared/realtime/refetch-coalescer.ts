export interface Timers {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RefetchCoalescer {
  /** Asks for a refetch. Requests within one window share a single refetch at its end. */
  request(): void;
  /** Drops a pending refetch (the page is going away). */
  cancel(): void;
}

const browserTimers: Timers = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Merges a burst of change events into one refetch. A bidding war can produce several
 * `auction:changed` events a second; each only says "something changed", so one refetch after
 * the burst shows the same final state as one per event, for a fraction of the requests.
 *
 * A fixed window, not a debounce: the first request schedules the refetch and later ones join
 * it. Under a continuous stream of events a debounce would keep postponing and never refetch;
 * this refetches at least once per window.
 */
export function createRefetchCoalescer(
  refetch: () => void,
  windowMilliseconds = 250,
  timers: Timers = browserTimers,
): RefetchCoalescer {
  let pendingTimer: unknown = null;

  return {
    request() {
      if (pendingTimer !== null) return;
      pendingTimer = timers.setTimeout(() => {
        pendingTimer = null;
        refetch();
      }, windowMilliseconds);
    },
    cancel() {
      if (pendingTimer === null) return;
      timers.clearTimeout(pendingTimer);
      pendingTimer = null;
    },
  };
}
