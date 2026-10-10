import { Logger } from '@nestjs/common';
import { connect } from 'amqplib';
import type { ConfirmChannel } from 'amqplib';
import { MessagingUnavailableError } from './messaging.errors';
import { MessagingTopology, declareExchanges } from './messaging-topology';

export type AmqpConnection = Awaited<ReturnType<typeof connect>>;

/** Runs again after every reconnect. */
export type ConnectionReadyListener = (connection: AmqpConnection) => Promise<void>;

const INITIAL_RECONNECT_DELAY_MILLISECONDS = 1_000;
const MAXIMUM_RECONNECT_DELAY_MILLISECONDS = 30_000;

/**
 * Lazy (only the worker calls `start()`), fails fast at boot, and afterwards reconnects with
 * backoff, re-declaring the topology and re-running the ready listeners.
 */
export class RabbitMqConnection {
  private readonly logger = new Logger(RabbitMqConnection.name);
  private connection: AmqpConnection | null = null;
  private confirmChannel: ConfirmChannel | null = null;
  private startPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMilliseconds = INITIAL_RECONNECT_DELAY_MILLISECONDS;
  private isClosing = false;
  private readonly readyListeners: ConnectionReadyListener[] = [];

  constructor(
    private readonly url: string,
    readonly topology: MessagingTopology,
  ) {}

  start(): Promise<void> {
    this.startPromise ??= this.open();
    return this.startPromise;
  }

  async onReady(listener: ConnectionReadyListener): Promise<void> {
    this.readyListeners.push(listener);
    // While open() is still running, its loop over readyListeners will reach this one.
    if (this.connection) await listener(this.connection);
  }

  publishingChannel(): ConfirmChannel {
    if (!this.confirmChannel) throw new MessagingUnavailableError();
    return this.confirmChannel;
  }

  get isConnected(): boolean {
    return this.connection !== null;
  }

  async close(): Promise<void> {
    this.isClosing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // A start that is still connecting would otherwise open a connection after we closed.
    await this.startPromise?.catch(() => undefined);
    const connection = this.connection;
    this.connection = null;
    this.confirmChannel = null;
    if (connection) await connection.close().catch(() => undefined);
  }

  private async open(): Promise<void> {
    const connection = await connect(this.url);
    try {
      connection.on('error', (error: unknown) => this.logger.error(`RabbitMQ connection error: ${describe(error)}`));
      connection.on('close', () => this.handleConnectionClosed(connection));

      const confirmChannel = await connection.createConfirmChannel();
      confirmChannel.on('error', (error: unknown) => this.logger.error(`RabbitMQ publishing channel error: ${describe(error)}`));
      // A channel error closes only the channel; close the connection to reuse the reconnect path.
      confirmChannel.on('close', () => {
        if (!this.isClosing && this.connection === connection) void connection.close().catch(() => undefined);
      });
      await declareExchanges(confirmChannel, this.topology);

      for (const listener of this.readyListeners) await listener(connection);

      // A reconnect that finished after close() began must not leave a connection open.
      if (this.isClosing) {
        await connection.close().catch(() => undefined);
        return;
      }
      this.confirmChannel = confirmChannel;
      this.connection = connection;
      this.reconnectDelayMilliseconds = INITIAL_RECONNECT_DELAY_MILLISECONDS;
      this.logger.log('connected to RabbitMQ');
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private handleConnectionClosed(connection: AmqpConnection): void {
    if (this.connection !== connection) return;
    this.connection = null;
    this.confirmChannel = null;
    if (this.isClosing) return;
    this.logger.warn('RabbitMQ connection closed; reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delayMilliseconds = this.reconnectDelayMilliseconds;
    this.reconnectDelayMilliseconds = Math.min(delayMilliseconds * 2, MAXIMUM_RECONNECT_DELAY_MILLISECONDS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isClosing) return;
      this.open().catch((error: unknown) => {
        this.logger.error(`RabbitMQ reconnect failed (next try in ${this.reconnectDelayMilliseconds} ms): ${describe(error)}`);
        this.scheduleReconnect();
      });
    }, delayMilliseconds);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
