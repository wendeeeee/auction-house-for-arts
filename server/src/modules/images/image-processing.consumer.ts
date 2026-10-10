import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { z } from 'zod';
import {
  ConsumeDecision,
  ConsumerQueue,
  IncomingMessage,
  QueueConsumer,
  RabbitMqConnection,
} from '../../common/messaging';
import { OUTBOX_EVENT_ROUTING_KEYS, imageUploadedPayloadSchema } from '../outbox';
import { ImageProcessingService } from './image-processing.service';

export const IMAGE_PROCESSING_QUEUE: ConsumerQueue = {
  name: 'images.process-uploaded',
  bindingKeys: [OUTBOX_EVENT_ROUTING_KEYS.ImageUploaded],
  deliveryLimit: 5,
};

// Decoding a 50-megapixel image takes about 150 MB, so only a couple run at once.
const PREFETCH = 2;

const messageIdSchema = z.uuid();

@Injectable()
export class ImageProcessingConsumer implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(ImageProcessingConsumer.name);
  private readonly consumer: QueueConsumer;

  constructor(
    connection: RabbitMqConnection,
    private readonly imageProcessingService: ImageProcessingService,
  ) {
    this.consumer = new QueueConsumer(connection, { queue: IMAGE_PROCESSING_QUEUE, prefetch: PREFETCH }, (message) =>
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
      this.logger.error(`dead-lettering an ImageUploaded message without a UUID message ID (${String(message.messageId)})`);
      return 'dead_letter';
    }
    if (message.type !== 'ImageUploaded') {
      this.logger.error(`dead-lettering message ${eventId.data}: expected type ImageUploaded, got ${String(message.type)}`);
      return 'dead_letter';
    }
    const payload = imageUploadedPayloadSchema.safeParse(message.body);
    if (!payload.success) {
      this.logger.error(`dead-lettering message ${eventId.data}: invalid ImageUploaded payload`);
      return 'dead_letter';
    }

    const outcome = await this.imageProcessingService.processUploadedImage(payload.data.imageId);
    this.logger.log(`image ${payload.data.imageId}: ${outcome}`);
    return 'ack';
  }
}
