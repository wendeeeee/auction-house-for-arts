import { Module } from '@nestjs/common';
import { MessagingModule } from '../../common/messaging';
import { OutboxPublisherService } from './outbox-publisher.service';
import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';

@Module({
  providers: [OutboxRepository, OutboxService],
  exports: [OutboxService, OutboxRepository],
})
export class OutboxModule {}

/** Worker only: the API records events without ever connecting to RabbitMQ. */
@Module({
  imports: [OutboxModule, MessagingModule],
  providers: [OutboxPublisherService],
  exports: [OutboxPublisherService, MessagingModule],
})
export class OutboxPublishingModule {}
