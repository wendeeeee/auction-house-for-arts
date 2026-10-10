import { useSyncExternalStore } from 'react';
import { demoUserStore } from '../../shared/session/demo-user-store';

/** The chosen demo user's ID (null when anonymous); re-renders when it changes. */
export function useDemoUserId(): string | null {
  return useSyncExternalStore(demoUserStore.subscribe, demoUserStore.get);
}
