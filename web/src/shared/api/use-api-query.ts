import { useEffect, useState } from 'react';

export type ApiQueryState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: unknown };

/**
 * Runs `load` when the key changes and tracks its state. The previous request is aborted, so
 * a slow response for an old filter can never overwrite the result of a newer one.
 * `key` is a string the caller builds from everything `load` depends on.
 */
export function useApiQuery<T>(key: string, load: (signal: AbortSignal) => Promise<T>): ApiQueryState<T> {
  const [state, setState] = useState<ApiQueryState<T>>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'success', data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', error });
      },
    );
    return () => controller.abort();
    // `load` is recreated every render; `key` captures what it depends on.
  }, [key]);

  return state;
}
