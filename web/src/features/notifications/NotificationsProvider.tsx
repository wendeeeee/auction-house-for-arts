import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { NotificationListView, NotificationView } from '../../shared/api/api-types';
import { useApiQuery } from '../../shared/api/use-api-query';
import { realtimeConnection } from '../../shared/realtime/realtime-client';
import { useDemoUserId } from '../demo-user/use-demo-user-id';
import { listNotifications, markNotificationRead } from './notifications-api';

interface NotificationsContextValue {
  readonly hasInbox: boolean;
  readonly notifications: readonly NotificationView[];
  readonly unreadCount: number;
  /** Live arrivals waiting for the outcome dialog. */
  readonly arrivals: readonly NotificationView[];
  markRead(notificationId: string): void;
  dismissArrival(notificationId: string): void;
}

const EMPTY_INBOX: NotificationListView = { items: [], unreadCount: 0 };

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** The server's inbox is the source of truth; live arrivals only trigger a refetch and the dialog. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const demoUserId = useDemoUserId();
  const [refreshCount, setRefreshCount] = useState(0);
  const [arrivals, setArrivals] = useState<readonly NotificationView[]>([]);
  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  const inbox = useApiQuery(`notifications:${demoUserId ?? 'anonymous'}:${refreshCount}`, (signal) =>
    demoUserId === null ? Promise.resolve(EMPTY_INBOX) : listNotifications(signal),
  );
  const lastLoaded = useRef<{ userId: string | null; inbox: NotificationListView }>({ userId: null, inbox: EMPTY_INBOX });
  if (inbox.status === 'success') lastLoaded.current = { userId: demoUserId, inbox: inbox.data };
  const shown = lastLoaded.current.userId === demoUserId ? lastLoaded.current.inbox : EMPTY_INBOX;

  useEffect(() => setArrivals([]), [demoUserId]);

  useEffect(
    () =>
      realtimeConnection.onNotification((notification) => {
        setArrivals((current) =>
          current.some((queued) => queued.id === notification.id) ? current : [...current, notification],
        );
        refresh();
      }),
    [refresh],
  );

  const markRead = useCallback(
    (notificationId: string) => {
      markNotificationRead(notificationId).then(refresh, refresh);
    },
    [refresh],
  );

  const dismissArrival = useCallback(
    (notificationId: string) => setArrivals((current) => current.filter((arrival) => arrival.id !== notificationId)),
    [],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      hasInbox: demoUserId !== null,
      notifications: shown.items,
      unreadCount: shown.unreadCount,
      arrivals,
      markRead,
      dismissArrival,
    }),
    [demoUserId, shown, arrivals, markRead, dismissArrival],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error('useNotifications must be used inside NotificationsProvider.');
  return value;
}
