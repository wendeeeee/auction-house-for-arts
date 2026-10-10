import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { Server, ServerOptions } from 'socket.io';
import { InvariantViolationError } from '../../common/errors';

type RedisClient = ReturnType<typeof createClient>;

/**
 * Socket.IO with the Redis adapter, so several API instances share rooms: an emit to
 * `auction:{slug}` on one instance is published to Redis and delivered by every instance to
 * its own sockets in that room.
 *
 * Used by `main.ts` only. Tests run on Nest's default in-memory adapter (one instance needs
 * no Redis), except the integration test that proves two instances share rooms.
 *
 * Redis carries only these fan-out messages; it holds no state of record. If Redis is down,
 * bids still commit, and viewers catch up when their refetch-on-reconnect runs.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly redisLogger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private readonly clients: RedisClient[] = [];

  constructor(application: INestApplicationContext) {
    super(application);
  }

  /**
   * Call before `app.listen()`. `channelPrefix` namespaces the Redis channels; only instances
   * that use the same prefix share rooms (tests use their own, so a running dev API never
   * receives their broadcasts).
   */
  async connectToRedis(redisUrl: string, options: { channelPrefix?: string } = {}): Promise<void> {
    // Two connections: a Redis connection in subscriber mode can run no other commands.
    const publisher = createClient({ url: redisUrl });
    const subscriber = publisher.duplicate();
    for (const client of [publisher, subscriber]) {
      // Without a listener, node-redis rethrows connection errors as uncaught exceptions. The
      // client reconnects on its own; log and let it.
      client.on('error', (error: unknown) => {
        this.redisLogger.error(`Redis: ${error instanceof Error ? error.message : String(error)}`);
      });
      this.clients.push(client);
    }
    await Promise.all([publisher.connect(), subscriber.connect()]);
    this.adapterConstructor = createAdapter(publisher, subscriber, { key: options.channelPrefix ?? 'socket.io' });
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    if (!this.adapterConstructor) {
      throw new InvariantViolationError('RedisIoAdapter.connectToRedis() must complete before the app initializes.');
    }
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterConstructor);
    return server;
  }

  /** Runs on app.close(), after the Socket.IO server has closed. */
  override async dispose(): Promise<void> {
    await super.dispose();
    await Promise.all(this.clients.filter((client) => client.isOpen).map((client) => client.close()));
    this.clients.length = 0;
  }
}
