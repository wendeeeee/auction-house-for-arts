import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRefetchCoalescer } from './refetch-coalescer';

describe('createRefetchCoalescer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('merges a burst of requests into one refetch at the end of the window', () => {
    const refetch = vi.fn();
    const coalescer = createRefetchCoalescer(refetch, 250);

    for (let index = 0; index < 5; index += 1) coalescer.request();
    vi.advanceTimersByTime(249);
    expect(refetch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refetches again for a burst that arrives after the previous refetch', () => {
    const refetch = vi.fn();
    const coalescer = createRefetchCoalescer(refetch, 250);

    coalescer.request();
    vi.advanceTimersByTime(250);
    coalescer.request();
    coalescer.request();
    vi.advanceTimersByTime(250);

    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('keeps refetching once per window under a continuous stream, unlike a debounce', () => {
    const refetch = vi.fn();
    const coalescer = createRefetchCoalescer(refetch, 250);

    for (let elapsed = 0; elapsed < 1_000; elapsed += 50) {
      coalescer.request();
      vi.advanceTimersByTime(50);
    }

    expect(refetch).toHaveBeenCalledTimes(4);
  });

  it('drops a pending refetch on cancel, and works again afterwards', () => {
    const refetch = vi.fn();
    const coalescer = createRefetchCoalescer(refetch, 250);

    coalescer.request();
    coalescer.cancel();
    vi.advanceTimersByTime(1_000);
    expect(refetch).not.toHaveBeenCalled();

    coalescer.request();
    vi.advanceTimersByTime(250);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
