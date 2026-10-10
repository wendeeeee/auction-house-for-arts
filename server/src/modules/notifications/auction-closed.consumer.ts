import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { z } from 'zod';
import {
  ConsumeDecision,
  ConsumerQueue,
  IncomingMessage,
  QueueConsumer,
  RabbitMqConnection,
} from '../../common/messaging';
import { OUTBOX_EVENT_ROUTING_KEYS, auctionClosedPayloadSchema } from '../outbox';
import { NotificationService } from './notification.service';

export const AUCTION_CLOSED_NOTIFICATIONS_QUEUE: ConsumerQueue = {
  name: 'notifications.auction-closed',
  bindingKeys: [OUTBOX_EVENT_ROUTING_KEYS.AuctionClosed],
  deliveryLimit: 5,
};

const PREFETCH = 10;

const messageIdSchema = z.uuid();

/** Acks only after the notifications are stored; a redelivery is a no-op (see the repository). */
@Injectable()
export class AuctionClosedConsumer implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(AuctionClosedConsumer.name);
  private readonly consumer: QueueConsumer;

  constructor(
    connection: RabbitMqConnection,
    private readonly notificationService: NotificationService,
  ) {
    this.consumer = new QueueConsumer(connection, { queue: AUCTION_CLOSED_NOTIFICATIONS_QUEUE, prefetch: PREFETCH }, (message) =>
      this.handle(message),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }

  /** Malformed messages are dead-lettered; a storage error propagates so the consumer retries. */
  async handle(message: IncomingMessage): Promise<ConsumeDecision> {
    const eventId = messageIdSchema.safeParse(message.messageId);
    if (!eventId.success) {
      this.logger.error(`dead-lettering an AuctionClosed message without a UUID message ID (${String(message.messageId)})`);
      return 'dead_letter';
    }
    if (message.type !== 'AuctionClosed') {
      this.logger.error(`dead-lettering message ${eventId.data}: expected type AuctionClosed, got ${String(message.type)}`);
      return 'dead_letter';
    }
    const payload = auctionClosedPayloadSchema.safeParse(message.body);
    if (!payload.success) {
      const problems = payload.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      this.logger.error(`dead-lettering message ${eventId.data}: invalid AuctionClosed payload (${problems})`);
      return 'dead_letter';
    }

    await this.notificationService.deliverAuctionClosed(eventId.data, payload.data);
    return 'ack';
  }
}
