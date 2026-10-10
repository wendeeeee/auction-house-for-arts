import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Per-request context that follows the request through every `await`. Loggers and the
 * exception filter read the correlation ID from here instead of having it passed around.
 */
export const RequestContext = {
  run<T>(store: RequestContextStore, work: () => T): T {
    return storage.run(store, work);
  },
  current(): RequestContextStore | undefined {
    return storage.getStore();
  },
  correlationId(): string | undefined {
    return storage.getStore()?.correlationId;
  },
};
