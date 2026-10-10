import { describe, expect, it, vi } from 'vitest';
import { type RealtimeSocket, createRealtimeConnection } from './realtime-connection';
import type { HandshakeAuth } from './realtime-events';

/** A socket whose server side the test drives: connect, drop, and push events. */
class FakeSocket implements RealtimeSocket {
  auth: RealtimeSocket['auth'];
  connected = false;
  readonly emitted: [string, unknown][] = [];
  connectCalls = 0;
  disconnectCalls = 0;
  private readonly listeners = new Map<string, ((...args: never[]) => void)[]>();

  constructor(auth: HandshakeAuth) {
    this.auth = auth;
  }

  on(event: string, listener: (...args: never[]) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, payload?: unknown): this {
    this.emitted.push([event, payload]);
    return this;
  }

  connect(): this {
    this.connectCalls += 1;
    return this;
  }

  disconnect(): this {
    this.disconnectCalls += 1;
    this.connected = false;
    return this;
  }

  /** The server accepted the (re)connection. */
  simulateConnected(): void {
    this.connected = true;
    this.deliver('connect');
  }

  /** The network dropped; socket.io-client will reconnect by itself. */
  simulateDropped(): void {
    this.connected = false;
    this.deliver('disconnect');
  }

  deliver(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) (listener as (value: unknown) => void)(payload);
  }

  takeEmitted(): [string, unknown][] {
    return this.emitted.splice(0);
  }
}

function setUp(initialUserId: string | null = null) {
  let demoUserId = initialUserId;
  const userListeners = new Set<() => void>();
  const sockets: FakeSocket[] = [];
  const connection = createRealtimeConnection({
    createSocket: (auth) => {
      const socket = new FakeSocket(auth);
      sockets.push(socket);
      return socket;
    },
    getDemoUserId: () => demoUserId,
    subscribeToDemoUser: (listener) => {
      userListeners.add(listener);
      return () => userListeners.delete(listener);
    },
  });
  const switchUser = (userId: string | null) => {
    demoUserId = userId;
    for (const listener of userListeners) listener();
  };
  const socket = () => {
    const created = sockets[0];
    if (!created) throw new Error('no socket was created');
    return created;
  };
  return { connection, sockets, socket, switchUser };
}

describe('createRealtimeConnection', () => {
  it('opens no socket until something needs it, then exactly one per tab', () => {
    const { connection, sockets } = setUp();
    expect(sockets).toHaveLength(0);

    connection.watchAuction('first', vi.fn());
    connection.watchAuction('second', vi.fn());
    connection.onOutbid(vi.fn());

    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.connectCalls).toBe(1);
  });

  it('sends the demo user in the handshake', () => {
    const { connection, socket } = setUp('user-1');
    connection.onOutbid(vi.fn());
    expect(socket().auth).toEqual({ demoUserId: 'user-1' });
  });

  it('joins the room once connected, and asks the page to refetch what it may have missed', () => {
    const { connection, socket } = setUp();
    const onRefetchNeeded = vi.fn();

    connection.watchAuction('blue-hour', onRefetchNeeded);
    expect(socket().takeEmitted()).toEqual([]); // not connected yet

    socket().simulateConnected();
    expect(socket().takeEmitted()).toEqual([['auction:watch', { slug: 'blue-hour' }]]);
    expect(onRefetchNeeded).toHaveBeenCalledWith('connected');
  });

  it('rejoins every watched room and refetches after a reconnect', () => {
    const { connection, socket } = setUp();
    const onBlueHour = vi.fn();
    const onDesert = vi.fn();
    connection.watchAuction('blue-hour', onBlueHour);
    connection.watchAuction('desert-geometry', onDesert);
    socket().simulateConnected();
    socket().takeEmitted();
    onBlueHour.mockClear();
    onDesert.mockClear();

    socket().simulateDropped();
    socket().simulateConnected();

    expect(socket().takeEmitted()).toEqual([
      ['auction:watch', { slug: 'blue-hour' }],
      ['auction:watch', { slug: 'desert-geometry' }],
    ]);
    expect(onBlueHour).toHaveBeenCalledExactlyOnceWith('connected');
    expect(onDesert).toHaveBeenCalledExactlyOnceWith('connected');
  });

  it('joins at once when already connected', () => {
    const { connection, socket } = setUp();
    connection.onOutbid(vi.fn());
    socket().simulateConnected();

    connection.watchAuction('blue-hour', vi.fn());

    expect(socket().takeEmitted()).toEqual([['auction:watch', { slug: 'blue-hour' }]]);
  });

  it('routes auction:changed only to watchers of that auction', () => {
    const { connection, socket } = setUp();
    const onBlueHour = vi.fn();
    const onDesert = vi.fn();
    connection.watchAuction('blue-hour', onBlueHour);
    connection.watchAuction('desert-geometry', onDesert);
    socket().simulateConnected();
    onBlueHour.mockClear();
    onDesert.mockClear();

    socket().deliver('auction:changed', { slug: 'blue-hour', priceCents: 510_00, endsAt: '', extended: false });

    expect(onBlueHour).toHaveBeenCalledExactlyOnceWith('changed');
    expect(onDesert).not.toHaveBeenCalled();
  });

  it('leaves the room when the last watcher of an auction unwatches, and stops calling it', () => {
    const { connection, socket } = setUp();
    const first = vi.fn();
    const second = vi.fn();
    const unwatchFirst = connection.watchAuction('blue-hour', first);
    const unwatchSecond = connection.watchAuction('blue-hour', second);
    socket().simulateConnected();
    socket().takeEmitted();

    unwatchFirst();
    expect(socket().takeEmitted()).toEqual([]); // another watcher still needs the room
    unwatchSecond();
    expect(socket().takeEmitted()).toEqual([['auction:unwatch', { slug: 'blue-hour' }]]);

    first.mockClear();
    second.mockClear();
    socket().deliver('auction:changed', { slug: 'blue-hour', priceCents: 1, endsAt: '', extended: false });
    socket().simulateConnected();
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(socket().takeEmitted()).toEqual([]);
  });

  it('asks watchers of a closed auction, and only them, to refetch its outcome', () => {
    const { connection, socket } = setUp();
    const onBlueHour = vi.fn();
    const onDesert = vi.fn();
    connection.watchAuction('blue-hour', onBlueHour);
    connection.watchAuction('desert-geometry', onDesert);
    socket().simulateConnected();
    onBlueHour.mockClear();
    onDesert.mockClear();

    socket().deliver('auction:closed', { slug: 'blue-hour' });

    expect(onBlueHour).toHaveBeenCalledExactlyOnceWith('closed');
    expect(onDesert).not.toHaveBeenCalled();
  });

  it('delivers new notifications to every listener until it unsubscribes', () => {
    const { connection, socket } = setUp('user-1');
    const listener = vi.fn();
    const unsubscribe = connection.onNotification(listener);
    const notification = {
      id: 'notification-1',
      kind: 'bidder_auction_won',
      auctionSlug: 'blue-hour',
      artworkTitle: 'Blue Hour',
      outcome: 'sold',
      hammerPriceCents: 510_00,
      createdAt: '2026-01-15T13:00:00.000Z',
      readAt: null,
    };

    socket().deliver('notification:created', notification);
    unsubscribe();
    socket().deliver('notification:created', notification);

    expect(listener).toHaveBeenCalledExactlyOnceWith(notification);
  });

  it('delivers outbid alerts to every listener until it unsubscribes', () => {
    const { connection, socket } = setUp('user-1');
    const listener = vi.fn();
    const unsubscribe = connection.onOutbid(listener);
    const alert = { slug: 'blue-hour', artworkTitle: 'Blue Hour', priceCents: 510_00 };

    socket().deliver('user:outbid', alert);
    unsubscribe();
    socket().deliver('user:outbid', alert);

    expect(listener).toHaveBeenCalledExactlyOnceWith(alert);
  });

  it('reconnects as the new user when the demo user changes', () => {
    const { connection, socket, switchUser } = setUp('user-1');
    connection.watchAuction('blue-hour', vi.fn());
    socket().simulateConnected();
    socket().takeEmitted();

    switchUser('user-2');

    expect(socket().auth).toEqual({ demoUserId: 'user-2' });
    expect(socket().disconnectCalls).toBe(1);
    expect(socket().connectCalls).toBe(2);

    switchUser(null);
    expect(socket().auth).toEqual({});
  });
});
