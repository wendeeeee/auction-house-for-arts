import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import { createClient } from 'redis';
import { APP_CONFIG, AppConfig } from '../../config';
import { auctionRoom, userRoom } from './realtime.types';

/** Emits from a process with no Socket.IO server (the worker). */
export interface RealtimeEmitter {
  /** Best effort: never throws. */
  emitToUser(userId: string, eventName: string, payload: unknown): void;
  emitToAuction(slug: string, eventName: string, payload: unknown): void;
}

export const REALTIME_EMITTER = Symbol('REALTIME_EMITTER');

/** Must match RedisIoAdapter's channel key. */
const SOCKET_IO_CHANNEL_KEY = 'socket.io';

/**
 * Connects to Redis on the first emit. `@socket.io/redis-emitter` drops the `publish` promise,
 * so it gets a client whose `publish` catches.
 */
@Injectable()
export class RedisRealtimeEmitter implements RealtimeEmitter, OnApplicationShutdown {
  private readonly logger = new Logger(RedisRealtimeEmitter.name);
  private client: ReturnType<typeof createClient> | null = null;
  private emitter: Promise<Emitter> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  emitToUser(userId: string, eventName: string, payload: unknown): void {
    this.emit(userRoom(userId), eventName, payload);
  }

  emitToAuction(slug: string, eventName: string, payload: unknown): void {
    this.emit(auctionRoom(slug), eventName, payload);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.emitter?.catch(() => undefined);
    if (this.client?.isOpen) await this.client.close();
  }

  private emit(room: string, eventName: string, payload: unknown): void {
    this.connectedEmitter().then(
      (emitter) => {
        emitter.to(room).emit(eventName, payload);
      },
      (error: unknown) => this.logger.error(`could not emit ${eventName} to ${room}: ${describe(error)}`),
    );
  }

  private connectedEmitter(): Promise<Emitter> {
    if (this.emitter) return this.emitter;
    const client = createClient({ url: this.config.redis.url });
    // Without a listener, node-redis rethrows connection errors as uncaught exceptions.
    client.on('error', (error: unknown) => this.logger.error(`Redis: ${describe(error)}`));
    this.client = client;
    this.emitter = client.connect().then(
      () =>
        new Emitter(
          {
            publish: (channel: string, message: string | Buffer) =>
              client.publish(channel, message).catch((error: unknown) => {
                this.logger.error(`Redis publish failed: ${describe(error)}`);
              }),
          },
          { key: SOCKET_IO_CHANNEL_KEY },
        ),
    );
    this.emitter.catch(() => {
      this.emitter = null;
      this.client = null;
      void client.close().catch(() => undefined);
    });
    return this.emitter;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
