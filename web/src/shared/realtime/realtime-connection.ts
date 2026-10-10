import {
  AUCTION_CHANGED_EVENT,
  AUCTION_CLOSED_EVENT,
  type AuctionChangedEvent,
  type AuctionClosedEvent,
  type HandshakeAuth,
  NOTIFICATION_CREATED_EVENT,
  type NotificationCreatedEvent,
  UNWATCH_AUCTION_MESSAGE,
  USER_OUTBID_EVENT,
  type UserOutbidEvent,
  WATCH_AUCTION_MESSAGE,
} from './realtime-events';

/** The slice of a socket.io-client `Socket` this module uses, so tests can pass a fake. */
export interface RealtimeSocket {
  auth: Record<string, unknown> | ((callback: (data: object) => void) => void);
  readonly connected: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

export interface RealtimeConnectionOptions {
  /** Creates the socket without connecting it (`autoConnect: false`). */
  readonly createSocket: (auth: HandshakeAuth) => RealtimeSocket;
  readonly getDemoUserId: () => string | null;
  readonly subscribeToDemoUser: (listener: () => void) => () => void;
}

/**
 * Why a watcher is asked to refetch: the auction changed, its outcome was recorded, or the
 * socket (re)connected and events may have been missed while it was out of the room.
 */
export type AuctionRefetchReason = 'changed' | 'closed' | 'connected';

export interface RealtimeConnection {
  /** Joins `auction:{slug}` and calls `onRefetchNeeded` when the page should refetch. Returns the unwatch function. */
  watchAuction(slug: string, onRefetchNeeded: (reason: AuctionRefetchReason) => void): () => void;
  onOutbid(listener: (event: UserOutbidEvent) => void): () => void;
  onNotification(listener: (event: NotificationCreatedEvent) => void): () => void;
}

const authFor = (demoUserId: string | null): HandshakeAuth => (demoUserId ? { demoUserId } : {});

/**
 * One socket per tab, opened on first use and shared by every page.
 *
 * - **Rooms follow pages:** a page watches its auction on mount and unwatches on unmount. The
 *   server forgets rooms when a connection drops, so every `connect` (the first one and each
 *   automatic reconnect) re-sends `auction:watch` for every watched auction.
 * - **No missed updates:** after each `connect`, watchers are asked to refetch, because
 *   events sent while the socket was out of the room are gone for good.
 * - **Identity follows the user switcher:** the handshake carries the demo user, so switching
 *   users reconnects with the new identity (and the new user's `user:{id}` room).
 */
export function createRealtimeConnection(options: RealtimeConnectionOptions): RealtimeConnection {
  let socket: RealtimeSocket | null = null;
  const watchersBySlug = new Map<string, Set<(reason: AuctionRefetchReason) => void>>();
  const outbidListeners = new Set<(event: UserOutbidEvent) => void>();
  const notificationListeners = new Set<(event: NotificationCreatedEvent) => void>();

  function ensureSocket(): RealtimeSocket {
    if (socket) return socket;
    const created = options.createSocket(authFor(options.getDemoUserId()));
    created.on('connect', () => {
      for (const [slug, watchers] of watchersBySlug) {
        created.emit(WATCH_AUCTION_MESSAGE, { slug });
        for (const watcher of [...watchers]) watcher('connected');
      }
    });
    created.on(AUCTION_CHANGED_EVENT, (event: AuctionChangedEvent) => {
      for (const watcher of [...(watchersBySlug.get(event.slug) ?? [])]) watcher('changed');
    });
    created.on(AUCTION_CLOSED_EVENT, (event: AuctionClosedEvent) => {
      for (const watcher of [...(watchersBySlug.get(event.slug) ?? [])]) watcher('closed');
    });
    created.on(USER_OUTBID_EVENT, (event: UserOutbidEvent) => {
      for (const listener of [...outbidListeners]) listener(event);
    });
    created.on(NOTIFICATION_CREATED_EVENT, (event: NotificationCreatedEvent) => {
      for (const listener of [...notificationListeners]) listener(event);
    });
    options.subscribeToDemoUser(() => {
      created.auth = authFor(options.getDemoUserId());
      created.disconnect();
      created.connect();
    });
    created.connect();
    socket = created;
    return created;
  }

  return {
    watchAuction(slug, onRefetchNeeded) {
      const connection = ensureSocket();
      let watchers = watchersBySlug.get(slug);
      if (!watchers) {
        watchers = new Set();
        watchersBySlug.set(slug, watchers);
        // Not yet connected: the `connect` handler will send it.
        if (connection.connected) connection.emit(WATCH_AUCTION_MESSAGE, { slug });
      }
      watchers.add(onRefetchNeeded);

      return () => {
        const current = watchersBySlug.get(slug);
        if (!current?.delete(onRefetchNeeded) || current.size > 0) return;
        watchersBySlug.delete(slug);
        if (connection.connected) connection.emit(UNWATCH_AUCTION_MESSAGE, { slug });
      };
    },

    onOutbid(listener) {
      ensureSocket();
      outbidListeners.add(listener);
      return () => {
        outbidListeners.delete(listener);
      };
    },

    onNotification(listener) {
      ensureSocket();
      notificationListeners.add(listener);
      return () => {
        notificationListeners.delete(listener);
      };
    },
  };
}
