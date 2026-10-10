import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { z } from 'zod';
import {
  ConsumeDecision,
  ConsumerQueue,
  IncomingMessage,
  QueueConsumer,
  RabbitMqConnection,
} from '../../common/messaging';
import { OUTBOX_EVENT_ROUTING_KEYS, purchasePaidPayloadSchema } from '../outbox';
import { NotificationService } from './notification.service';

export const PURCHASE_PAID_NOTIFICATIONS_QUEUE: ConsumerQueue = {
  name: 'notifications.purchase-paid',
  bindingKeys: [OUTBOX_EVENT_ROUTING_KEYS.PurchasePaid],
  deliveryLimit: 5,
};

const PREFETCH = 10;

const messageIdSchema = z.uuid();

@Injectable()
export class PurchasePaidConsumer implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(PurchasePaidConsumer.name);
  private readonly consumer: QueueConsumer;

  constructor(
    connection: RabbitMqConnection,
    private readonly notificationService: NotificationService,
  ) {
    this.consumer = new QueueConsumer(connection, { queue: PURCHASE_PAID_NOTIFICATIONS_QUEUE, prefetch: PREFETCH }, (message) =>
      this.handle(message),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }

  async handle(message: IncomingMessage): Promise<ConsumeDecision> {
    const eventId = messageIdSchema.safeParse(message.messageId);
    if (!eventId.success) {
      this.logger.error(`dead-lettering a PurchasePaid message without a UUID message ID (${String(message.messageId)})`);
      return 'dead_letter';
    }
    if (message.type !== 'PurchasePaid') {
      this.logger.error(`dead-lettering message ${eventId.data}: expected type PurchasePaid, got ${String(message.type)}`);
      return 'dead_letter';
    }
    const payload = purchasePaidPayloadSchema.safeParse(message.body);
    if (!payload.success) {
      const problems = payload.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      this.logger.error(`dead-lettering message ${eventId.data}: invalid PurchasePaid payload (${problems})`);
      return 'dead_letter';
    }

    await this.notificationService.deliverPurchasePaid(eventId.data, payload.data);
    return 'ack';
  }
}
