import type { AddressInfo } from 'node:net';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Socket as ClientSocket, io } from 'socket.io-client';
import { Clock } from '../../src/common/clock';
import { APP_CONFIG, AppConfig } from '../../src/config';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { RedisIoAdapter } from '../../src/modules/realtime';
import { auctionApi, seedUserId } from '../support/auction-api';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');
const ENDS_AT = new Date(START.getTime() + 60 * 60 * 1_000);

/**
 * Two API instances, one PostgreSQL, one Redis: what a load-balanced deployment looks like.
 * A viewer connected to instance A must hear about a bid placed through instance B. With
 * Nest's default in-memory adapter, B's emit would reach only B's sockets, and this fails.
 * Needs the Redis container (`npm run infra:up`), like these tests need PostgreSQL.
 */
describe('Socket.IO across two API instances (Redis adapter)', () => {
  let instanceA: NestFastifyApplication;
  let instanceB: NestFastifyApplication;
  let pool: Pool;
  const clock = new FakeClock(START);
  const openClients: ClientSocket[] = [];

  async function startInstance(): Promise<NestFastifyApplication> {
    const app = await createTestApp({
      configure: (builder) => builder.overrideProvider(Clock).useValue(clock),
      beforeInit: async (application) => {
        const adapter = new RedisIoAdapter(application);
        const config = application.get<AppConfig>(APP_CONFIG);
        await adapter.connectToRedis(config.redis.url, { channelPrefix: 'art-auction-test' });
        application.useWebSocketAdapter(adapter);
      },
    });
    await app.listen(0, '127.0.0.1');
    return app;
  }

  function urlOf(app: NestFastifyApplication): string {
    const { port } = app.getHttpServer().address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async function connect(app: NestFastifyApplication, handle: string | null): Promise<ClientSocket> {
    const socket = io(urlOf(app), {
      transports: ['websocket'],
      auth: handle === null ? {} : { demoUserId: seedUserId(handle) },
      reconnection: false,
      forceNew: true,
    });
    openClients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  function nextEvent(socket: ClientSocket, name: string): Promise<unknown> {
    return new Promise((resolve) => socket.once(name, resolve));
  }

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    instanceA = await startInstance();
    instanceB = await startInstance();
  });

  afterAll(async () => {
    for (const socket of openClients.splice(0)) socket.disconnect();
    await instanceA.close();
    await instanceB.close();
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

  it('delivers auction rooms and user rooms to sockets on the other instance', async () => {
    const created = await auctionApi(instanceA).create('rafael_ortiz', {
      artworkSlug: 'desert-geometry',
      startingPriceCents: 100_00,
      endsAt: ENDS_AT.toISOString(),
    });
    const slug = created.json().slug as string;
    const viewerOnA = await connect(instanceA, null);
    const previousLeaderOnA = await connect(instanceA, 'ada_mensah');
    expect(await viewerOnA.emitWithAck('auction:watch', { slug })).toEqual({ ok: true });

    const bidsThroughB = auctionApi(instanceB);
    const firstChange = nextEvent(viewerOnA, 'auction:changed');
    expect((await bidsThroughB.bid('ada_mensah', slug, 500_00)).statusCode).toBe(201);
    expect(await firstChange).toMatchObject({ slug, priceCents: 100_00 });

    const outbid = nextEvent(previousLeaderOnA, 'user:outbid');
    expect((await bidsThroughB.bid('bianca_rossi', slug, 600_00)).statusCode).toBe(201);
    expect(await outbid).toEqual({ slug, artworkTitle: 'Desert Geometry', priceCents: 510_00 });
  });
});
