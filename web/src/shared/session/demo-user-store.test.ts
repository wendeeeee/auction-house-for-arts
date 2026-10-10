import { describe, expect, it, vi } from 'vitest';
import { createDemoUserStore } from './demo-user-store';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

describe('demo user store', () => {
  it('restores the user saved earlier in the session', () => {
    const storage = memoryStorage({ 'art-auction.demo-user-id': 'user-1' });
    expect(createDemoUserStore(storage).get()).toBe('user-1');
  });

  it('persists a switch, clears it for anonymous, and notifies subscribers', () => {
    const storage = memoryStorage();
    const store = createDemoUserStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set('user-2');
    expect(storage.values.get('art-auction.demo-user-id')).toBe('user-2');

    store.set(null);
    expect(storage.values.has('art-auction.demo-user-id')).toBe(false);
    expect(store.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps working in memory when storage throws (private mode)', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createDemoUserStore(throwingStorage);

    expect(store.get()).toBeNull();
    store.set('user-3');
    expect(store.get()).toBe('user-3');
  });
});
