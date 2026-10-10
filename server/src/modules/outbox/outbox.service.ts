import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { InvariantViolationError } from '../../common/errors';
import { UnitOfWork } from '../../database';
import { OutboxRepository } from './outbox.repository';
import { OUTBOX_EVENT_PAYLOAD_SCHEMAS, OutboxEventPayloads, OutboxEventType } from './outbox.types';

@Injectable()
export class OutboxService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly outboxRepository: OutboxRepository,
    private readonly clock: Clock,
  ) {}

  /** Must run inside the caller's unit of work. Returns the event ID (the broker message ID). */
  async recordEvent<Type extends OutboxEventType>(type: Type, payload: OutboxEventPayloads[Type]): Promise<string> {
    if (!this.unitOfWork.isInTransaction) {
      throw new InvariantViolationError('recordEvent must be called inside the unit of work of the change it describes.', {
        type,
      });
    }
    const parsed = OUTBOX_EVENT_PAYLOAD_SCHEMAS[type].safeParse(payload);
    if (!parsed.success) {
      throw new InvariantViolationError('An outbox event payload does not match its schema.', {
        type,
        issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      });
    }

    const id = randomUUID();
    await this.outboxRepository.insert({ id, type, payload: parsed.data, occurredAt: this.clock.now() });
    return id;
  }
}
