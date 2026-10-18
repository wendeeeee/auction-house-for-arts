import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();


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
