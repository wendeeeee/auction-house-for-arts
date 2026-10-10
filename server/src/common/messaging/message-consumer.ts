import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';
import { ConsumerQueue, declareConsumerQueue } from './messaging-topology';
import { RabbitMqConnection } from './rabbitmq.connection';
import { computeRetryDelayMilliseconds } from './retry-delay';

/** `dead_letter`: can never succeed. `retry`: may succeed later, so it is requeued after a pause. */
export type ConsumeDecision = 'ack' | 'dead_letter' | 'retry';

export interface IncomingMessage {
  readonly messageId: string | undefined;
  readonly type: string | undefined;
  readonly body: unknown;
  readonly deliveryCount: number;
}

/** Throwing counts as `retry`. */
export type MessageHandler = (message: IncomingMessage) => Promise<ConsumeDecision>;

export interface QueueConsumerOptions {
  readonly queue: ConsumerQueue;
  readonly prefetch: number;
  readonly retryDelayMilliseconds?: (deliveryCount: number) => number;
}

/** Acks after the handler finishes: at-least-once delivery, so handlers must be idempotent. */
export class QueueConsumer {
  private readonly logger: Logger;
  private channel: Channel | null = null;
  private consumerTag: string | null = null;
  private readonly inFlight = new Set<Promise<void>>();
  private readonly stopping = new AbortController();

  constructor(
    private readonly connection: RabbitMqConnection,
    private readonly options: QueueConsumerOptions,
    private readonly handler: MessageHandler,
  ) {
    this.logger = new Logger(`QueueConsumer:${options.queue.name}`);
  }

  async start(): Promise<void> {
    await this.connection.start();
    await this.connection.onReady(async (amqpConnection) => {
      if (this.stopping.signal.aborted) return;
      const channel = await amqpConnection.createChannel();
      channel.on('error', (error: unknown) => this.logger.error(`channel error: ${describe(error)}`));
      // A channel error closes only the channel; force a reconnect so consuming resumes.
      channel.on('close', () => {
        if (!this.stopping.signal.aborted) void amqpConnection.close().catch(() => undefined);
      });
      await declareConsumerQueue(channel, this.connection.topology, this.options.queue);
      await channel.prefetch(this.options.prefetch);
      const { consumerTag } = await channel.consume(this.options.queue.name, (message) => this.receive(channel, message), {
        noAck: false,
      });
      this.channel = channel;
      this.consumerTag = consumerTag;
    });
  }

  /** Cancel, let in-flight messages finish and ack, then close the channel. */
  async stop(): Promise<void> {
    this.stopping.abort();
    const { channel, consumerTag } = this;
    if (channel && consumerTag) await channel.cancel(consumerTag).catch(() => undefined);
    await Promise.allSettled([...this.inFlight]);
    if (channel) await channel.close().catch(() => undefined);
    this.channel = null;
    this.consumerTag = null;
  }

  private receive(channel: Channel, message: ConsumeMessage | null): void {
    if (message === null) {
      this.logger.warn('subscription cancelled by the broker');
      return;
    }
    const work = this.process(channel, message).finally(() => this.inFlight.delete(work));
    this.inFlight.add(work);
  }

  private async process(channel: Channel, raw: ConsumeMessage): Promise<void> {
    const message = toIncomingMessage(raw);
    let decision: ConsumeDecision;
    if (message === null) {
      this.logger.error(`dead-lettering message ${raw.properties.messageId ?? '(no id)'}: body is not JSON`);
      decision = 'dead_letter';
    } else {
      try {
        decision = await this.handler(message);
      } catch (error) {
        this.logger.error(
          `message ${message.messageId ?? '(no id)'} failed on delivery ${message.deliveryCount}; will retry: ${describe(error)}`,
        );
        decision = 'retry';
      }
    }

    if (decision === 'retry' && message !== null) await this.pauseBeforeRetry(message.deliveryCount);
    try {
      if (decision === 'ack') channel.ack(raw);
      else channel.nack(raw, false, decision === 'retry');
    } catch (error) {
      // The channel died; the broker redelivers the unacked message.
      this.logger.warn(`could not settle message ${raw.properties.messageId ?? '(no id)'}: ${describe(error)}`);
    }
  }

  private async pauseBeforeRetry(deliveryCount: number): Promise<void> {
    const delayMilliseconds = (this.options.retryDelayMilliseconds ?? computeRetryDelayMilliseconds)(deliveryCount);
    if (delayMilliseconds <= 0) return;
    await sleep(delayMilliseconds, undefined, { signal: this.stopping.signal }).catch(() => undefined);
  }
}

function toIncomingMessage(raw: ConsumeMessage): IncomingMessage | null {
  let body: unknown;
  try {
    body = JSON.parse(raw.content.toString('utf8'));
  } catch {
    return null;
  }
  // Quorum queues count earlier failed deliveries here.
  const previousDeliveries = Number(raw.properties.headers?.['x-delivery-count'] ?? 0);
  return {
    messageId: raw.properties.messageId as string | undefined,
    type: raw.properties.type as string | undefined,
    body,
    deliveryCount: (Number.isFinite(previousDeliveries) ? previousDeliveries : 0) + 1,
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
