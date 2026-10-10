import type { AddressInfo } from 'node:net';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Socket as ClientSocket, io } from 'socket.io-client';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { auctionApi, seedUserId } from '../support/auction-api';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');
const ENDS_AT = new Date(START.getTime() + 60 * 60 * 1_000);
/** How long to wait before concluding that an event is not coming. */
const SILENCE_MILLISECONDS = 250;

interface ReceivedEvent {
  readonly name: string;
  readonly payload: unknown;
}

/** A connected client that records every event it receives. */
interface RecordingClient {
  readonly socket: ClientSocket;
  readonly received: ReceivedEvent[];
}

describe('real-time gateway (a listening server and socket.io-client)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let api: ReturnType<typeof auctionApi>;
  let serverUrl: string;
  const clock = new FakeClock(START);
  const openClients: ClientSocket[] = [];

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({ configure: (builder) => builder.overrideProvider(Clock).useValue(clock) });
    // Port 0: the OS picks a free port, so parallel runs and a running dev API never collide.
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${port}`;
    api = auctionApi(app);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    await seedCatalog(pool);
    clock.setTo(START);
  });

  afterEach(() => {
    for (const socket of openClients.splice(0)) socket.disconnect();
  });

  function createSocket(options: { auth?: Record<string, unknown>; transports?: ('websocket' | 'polling')[] }): ClientSocket {
    const socket = io(serverUrl, {
      transports: options.transports ?? ['websocket'],
      auth: options.auth ?? {},
      reconnection: false,
      forceNew: true,
    });
    openClients.push(socket);
    return socket;
  }

  async function connect(handle: string | null): Promise<RecordingClient> {
    const socket = createSocket({ auth: handle === null ? {} : { demoUserId: seedUserId(handle) } });
    const received: ReceivedEvent[] = [];
    socket.onAny((name: string, payload: unknown) => received.push({ name, payload }));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return { socket, received };
  }

  /** Resolves with the `connect_error` the server refused the connection with. */
  function expectRefusedConnection(socket: ClientSocket): Promise<Error & { data?: { code?: string } }> {
    return new Promise((resolve, reject) => {
      socket.once('connect', () => reject(new Error('expected the connection to be refused')));
      socket.once('connect_error', resolve);
    });
  }

  function watch(client: RecordingClient, slug: unknown) {
    return client.socket.emitWithAck('auction:watch', { slug });
  }

  function nextEvent(client: RecordingClient, name: string): Promise<unknown> {
    return new Promise((resolve) => client.socket.once(name, resolve));
  }

  const silence = () => new Promise((resolve) => setTimeout(resolve, SILENCE_MILLISECONDS));

  async function openAuction(artworkSlug = 'desert-geometry', sellerHandle = 'rafael_ortiz'): Promise<string> {
    const response = await api.create(sellerHandle, {
      artworkSlug,
      startingPriceCents: 100_00,
      endsAt: ENDS_AT.toISOString(),
    });
    expect(response.statusCode).toBe(201);
    return response.json().slug as string;
  }

  describe('auction rooms', () => {
    it('delivers auction:changed to viewers of that auction, and nothing to viewers of another', async () => {
      const watchedSlug = await openAuction();
      const otherSlug = await openAuction('lagos-at-dusk', 'bianca_rossi');
      const watcher = await connect(null);
      const otherWatcher = await connect('chidi_nwosu');
      expect(await watch(watcher, watchedSlug)).toEqual({ ok: true });
      expect(await watch(otherWatcher, otherSlug)).toEqual({ ok: true });

      const changed = nextEvent(watcher, 'auction:changed');
      expect((await api.bid('ada_mensah', watchedSlug, 500_00)).statusCode).toBe(201);

      expect(await changed).toEqual({ slug: watchedSlug, priceCents: 100_00, endsAt: ENDS_AT.toISOString(), extended: false });
      await silence();
      expect(otherWatcher.received).toEqual([]);
    });

    it('stops delivering after auction:unwatch', async () => {
      const slug = await openAuction();
      const watcher = await connect(null);
      await watch(watcher, slug);

      expect(await watcher.socket.emitWithAck('auction:unwatch', { slug })).toEqual({ ok: true });
      await api.bid('ada_mensah', slug, 500_00);

      await silence();
      expect(watcher.received).toEqual([]);
    });

    it('caps the auctions one connection can watch, without counting a repeat', async () => {
      const watcher = await connect(null);
      for (let index = 1; index <= 20; index += 1) {
        expect(await watch(watcher, `auction-${index}`)).toEqual({ ok: true });
      }

      expect(await watch(watcher, 'auction-21')).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'TOO_MANY_WATCHED_AUCTIONS' }),
      });
      expect(await watch(watcher, 'auction-20')).toEqual({ ok: true });

      await watcher.socket.emitWithAck('auction:unwatch', { slug: 'auction-1' });
      expect(await watch(watcher, 'auction-21')).toEqual({ ok: true });
    });

    it.each([[''], ['Not A Slug'], ['x:user:anyone'], [42], [null]])('rejects auction:watch for %p', async (slug) => {
      const watcher = await connect(null);
      expect(await watch(watcher, slug)).toEqual({ ok: false, error: expect.objectContaining({ code: 'VALIDATION_FAILED' }) });
    });
  });

  describe('user rooms', () => {
    it('alerts only the previous leader, wherever they are, when they are outbid', async () => {
      const slug = await openAuction();
      const previousLeader = await connect('ada_mensah'); // watching nothing: the alert follows the user
      const newLeader = await connect('bianca_rossi');
      const bystander = await connect('chidi_nwosu');
      await watch(bystander, slug);
      await api.bid('ada_mensah', slug, 500_00);

      const outbid = nextEvent(previousLeader, 'user:outbid');
      await api.bid('bianca_rossi', slug, 600_00);

      expect(await outbid).toEqual({ slug, artworkTitle: 'Desert Geometry', priceCents: 510_00 });
      await silence();
      expect(newLeader.received).toEqual([]);
      expect(bystander.received.map((event) => event.name)).toEqual(['auction:changed', 'auction:changed']);
    });

    it('gives a client no way into another user’s room', async () => {
      const slug = await openAuction();
      const intruder = await connect('chidi_nwosu');
      const adaId = seedUserId('ada_mensah');
      // There is no join message; the only room a client can name is auction:<slug>.
      intruder.socket.emit('join', `user:${adaId}`);
      expect(await watch(intruder, `user:${adaId}`)).toMatchObject({ ok: false });
      await api.bid('ada_mensah', slug, 500_00);

      await api.bid('bianca_rossi', slug, 600_00);

      await silence();
      expect(intruder.received).toEqual([]);
    });

    it('refuses a handshake with an unknown or malformed demoUserId, as HTTP answers 401', async () => {
      for (const demoUserId of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid', 42]) {
        const error = await expectRefusedConnection(createSocket({ auth: { demoUserId } }));
        expect(error.data).toEqual({ code: 'UNAUTHENTICATED', message: expect.any(String) });
      }
    });
  });

  describe('transport', () => {
    it('refuses a client that offers only HTTP long-polling', async () => {
      const error = await expectRefusedConnection(createSocket({ transports: ['polling'] }));
      expect(error).toBeInstanceOf(Error);
    });

    it('answers a raw polling handshake with 400', async () => {
      const response = await fetch(`${serverUrl}/socket.io/?EIO=4&transport=polling`);
      expect(response.status).toBe(400);
    });
  });
});
