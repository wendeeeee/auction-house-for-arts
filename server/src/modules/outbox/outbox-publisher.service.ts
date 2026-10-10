import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { MESSAGE_PUBLISHER, MessagePublisher } from '../../common/messaging';
import { withSpan } from '../../common/tracing';
import { OutboxRepository } from './outbox.repository';
import { OUTBOX_EVENT_ROUTING_KEYS, OutboxEvent, isOutboxEventType } from './outbox.types';

const PUBLISH_BATCH_SIZE = 50;
const CONFIRM_TIMEOUT_MILLISECONDS = 10_000;
// Longer than the confirm timeout, so a live publisher's claim never expires under it.
const CLAIM_LEASE_MILLISECONDS = 30_000;

export interface PublishBatchSummary {
  readonly published: number;
  readonly failed: number;
}

/** Claim with a lease, publish outside any transaction, mark only what was confirmed. See ADR 0003. */
@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);

  constructor(
    private readonly outboxRepository: OutboxRepository,
    @Inject(MESSAGE_PUBLISHER) private readonly messagePublisher: MessagePublisher,
    private readonly clock: Clock,
  ) {}

  async publishPendingBatch(): Promise<PublishBatchSummary> {
    const now = this.clock.now();
    const claimed = await this.outboxRepository.claimPending({
      now,
      claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MILLISECONDS),
      limit: PUBLISH_BATCH_SIZE,
    });
    if (claimed.length === 0) return { published: 0, failed: 0 };

    return withSpan('outbox.publish_batch', { 'outbox.batch_size': claimed.length }, async () => {
      const results = await Promise.allSettled(claimed.map((event) => this.publishAndAwaitConfirm(event)));

      const confirmedIds: string[] = [];
      for (const [index, result] of results.entries()) {
        const event = claimed[index]!;
        if (result.status === 'fulfilled') {
          confirmedIds.push(event.id);
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          this.logger.warn(`event ${event.id} (${event.type}) not confirmed, will retry: ${reason}`);
          await this.outboxRepository.releaseFailed(event.id, reason);
        }
      }
      // Only after the confirms: marking earlier would turn a crash or a nack into a lost event.
      if (confirmedIds.length > 0) await this.outboxRepository.markPublished(confirmedIds, this.clock.now());
      return { published: confirmedIds.length, failed: claimed.length - confirmedIds.length };
    });
  }

  private publishAndAwaitConfirm(event: OutboxEvent): Promise<void> {
    if (!isOutboxEventType(event.type)) {
      return Promise.reject(new Error(`No routing key for event type ${event.type}.`));
    }
    const confirmed = this.messagePublisher.publish({
      routingKey: OUTBOX_EVENT_ROUTING_KEYS[event.type],
      messageId: event.id,
      type: event.type,
      body: event.payload,
      occurredAt: event.occurredAt,
    });
    return withTimeout(confirmed, CONFIRM_TIMEOUT_MILLISECONDS, `no confirm within ${CONFIRM_TIMEOUT_MILLISECONDS} ms`);
  }
}

function withTimeout(promise: Promise<void>, milliseconds: number, message: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
