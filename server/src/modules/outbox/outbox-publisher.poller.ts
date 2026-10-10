import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { RabbitMqConnection } from '../../common/messaging';
import { PollingLoop } from '../../common/polling';
import { OutboxPublisherService } from './outbox-publisher.service';

const PUBLISH_POLL_INTERVAL_MILLISECONDS = 1_000;

@Injectable()
export class OutboxPublisherPoller implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(OutboxPublisherPoller.name);
  private readonly loop: PollingLoop;

  constructor(
    private readonly outboxPublisher: OutboxPublisherService,
    private readonly connection: RabbitMqConnection,
  ) {
    this.loop = new PollingLoop('outbox-publisher', PUBLISH_POLL_INTERVAL_MILLISECONDS, async () => {
      const summary = await this.outboxPublisher.publishPendingBatch();
      if (summary.published > 0 || summary.failed > 0) {
        this.logger.log(`published ${summary.published} event(s), ${summary.failed} to retry`);
      }
    });
  }

  /** Fails the worker's boot if RabbitMQ is unreachable. */
  async onApplicationBootstrap(): Promise<void> {
    await this.connection.start();
    this.loop.start();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.loop.stop();
  }
}
