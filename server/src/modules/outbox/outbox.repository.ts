import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../database';
import { OutboxEvent } from './outbox.types';

interface OutboxEventRow {
  id: string;
  type: string;
  payload: unknown;
  occurred_at: Date;
  published_at: Date | null;
  publish_attempt_count: number;
}

const OUTBOX_EVENT_COLUMNS = 'id, type, payload, occurred_at, published_at, publish_attempt_count';

export interface NewOutboxEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  readonly occurredAt: Date;
}

export interface PendingEventClaim {
  readonly now: Date;
  readonly claimExpiresAt: Date;
  readonly limit: number;
}

/** Owns the `outbox_events` table. */
@Injectable()
export class OutboxRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /** Inside the caller's transaction, so the event commits or rolls back with its change. */
  async insert(event: NewOutboxEvent): Promise<void> {
    await this.unitOfWork
      .requireTransaction()
      .query('INSERT INTO outbox_events (id, type, payload, occurred_at) VALUES ($1, $2, $3, $4)', [
        event.id,
        event.type,
        JSON.stringify(event.payload),
        event.occurredAt,
      ]);
  }

  /** One auto-committed statement: the claim is a lease on the row, not a lock held while publishing. */
  async claimPending(claim: PendingEventClaim): Promise<OutboxEvent[]> {
    const { rows } = await this.unitOfWork.client().query<OutboxEventRow>(
      `UPDATE outbox_events
          SET claim_expires_at = $2, publish_attempt_count = publish_attempt_count + 1
        WHERE id IN (
          SELECT id FROM outbox_events
           WHERE published_at IS NULL AND (claim_expires_at IS NULL OR claim_expires_at <= $1)
           ORDER BY occurred_at, id
           LIMIT $3
           FOR UPDATE SKIP LOCKED
        )
        RETURNING ${OUTBOX_EVENT_COLUMNS}`,
      [claim.now, claim.claimExpiresAt, claim.limit],
    );
    return rows
      .map(toOutboxEvent)
      .sort((first, second) => first.occurredAt.getTime() - second.occurredAt.getTime() || first.id.localeCompare(second.id));
  }

  async markPublished(eventIds: readonly string[], publishedAt: Date): Promise<void> {
    await this.unitOfWork.client().query(
      `UPDATE outbox_events
          SET published_at = $2, claim_expires_at = NULL, last_publish_error = NULL
        WHERE id = ANY($1::uuid[]) AND published_at IS NULL`,
      [eventIds, publishedAt],
    );
  }

  async releaseFailed(eventId: string, error: string): Promise<void> {
    await this.unitOfWork
      .client()
      .query(
        'UPDATE outbox_events SET claim_expires_at = NULL, last_publish_error = $2 WHERE id = $1 AND published_at IS NULL',
        [eventId, error],
      );
  }
}

function toOutboxEvent(row: OutboxEventRow): OutboxEvent {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    occurredAt: row.occurred_at,
    publishedAt: row.published_at,
    publishAttemptCount: row.publish_attempt_count,
  };
}
