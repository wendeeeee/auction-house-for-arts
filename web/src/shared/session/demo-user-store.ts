const STORAGE_KEY = 'art-auction.demo-user-id';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface DemoUserStore {
  get(): string | null;
  set(userId: string | null): void;
  subscribe(listener: () => void): () => void;
}

/**
 * The chosen demo user, persisted in sessionStorage: it survives reloads but each tab can act as
 * a different user, which is exactly what you want when demoing two bidders side by side.
 * Storage can be missing or throw (private mode, blocked site data); the value then lives in memory.
 */
export function createDemoUserStore(storage: KeyValueStorage | null): DemoUserStore {
  let currentUserId = readStoredUserId(storage);
  const listeners = new Set<() => void>();

  return {
    get: () => currentUserId,
    set(userId) {
      currentUserId = userId;
      try {
        if (userId) storage?.setItem(STORAGE_KEY, userId);
        else storage?.removeItem(STORAGE_KEY);
      } catch {
        // Keep the in-memory value; persistence is a convenience.
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function readStoredUserId(storage: KeyValueStorage | null): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function browserSessionStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export const demoUserStore = createDemoUserStore(browserSessionStorage());
