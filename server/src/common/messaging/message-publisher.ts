import { Injectable } from '@nestjs/common';
import { MessageNotConfirmedError } from './messaging.errors';
import { RabbitMqConnection } from './rabbitmq.connection';

export interface OutgoingMessage {
  readonly routingKey: string;
  /** Consumers deduplicate on this. */
  readonly messageId: string;
  readonly type: string;
  readonly body: unknown;
  readonly occurredAt: Date;
}

/** Resolves only once the broker confirms the message. */
export interface MessagePublisher {
  publish(message: OutgoingMessage): Promise<void>;
}

export const MESSAGE_PUBLISHER = Symbol('MESSAGE_PUBLISHER');

@Injectable()
export class RabbitMqMessagePublisher implements MessagePublisher {
  constructor(private readonly connection: RabbitMqConnection) {}

  publish(message: OutgoingMessage): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const channel = this.connection.publishingChannel();
      channel.publish(
        this.connection.topology.eventsExchange,
        message.routingKey,
        Buffer.from(JSON.stringify(message.body)),
        {
          persistent: true,
          messageId: message.messageId,
          type: message.type,
          contentType: 'application/json',
          timestamp: Math.floor(message.occurredAt.getTime() / 1_000),
        },
        // amqplib also calls this with an error for unconfirmed messages when the channel closes.
        (error: unknown) => {
          if (error) reject(new MessageNotConfirmedError(message.messageId, error));
          else resolve();
        },
      );
    });
  }
}
