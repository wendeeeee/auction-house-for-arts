import { Injectable } from '@nestjs/common';
import { InvariantViolationError } from '../../common/errors';
import { UnitOfWork } from '../../database';
import {
  AuctionOutcomeNotificationPayload,
  Notification,
  NotificationKind,
  auctionOutcomeNotificationPayloadSchema,
} from './notifications.types';

interface NotificationRow {
  id: string;
  event_id: string;
  recipient_user_id: string;
  kind: NotificationKind;
  payload: unknown;
  created_at: Date;
  read_at: Date | null;
}

const NOTIFICATION_COLUMNS = 'id, event_id, recipient_user_id, kind, payload, created_at, read_at';

export interface NewNotification {
  readonly eventId: string;
  readonly recipientUserId: string;
  readonly kind: NotificationKind;
  readonly payload: AuctionOutcomeNotificationPayload;
  readonly createdAt: Date;
}

/** Owns the `notification_deliveries` table. */
@Injectable()
export class NotificationRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /** Returns only the rows actually inserted: a redelivered event inserts and returns nothing. */
  async insertIfNew(notifications: readonly NewNotification[]): Promise<Notification[]> {
    if (notifications.length === 0) return [];
    const parameters: unknown[] = [];
    const valueLists = notifications.map((notification) => {
      parameters.push(
        notification.eventId,
        notification.recipientUserId,
        notification.kind,
        JSON.stringify(notification.payload),
        notification.createdAt,
      );
      const first = parameters.length - 4;
      return `($${first}, $${first + 1}, $${first + 2}, $${first + 3}, $${first + 4})`;
    });
    const { rows } = await this.unitOfWork.client().query<NotificationRow>(
      `INSERT INTO notification_deliveries (event_id, recipient_user_id, kind, payload, created_at)
       VALUES ${valueLists.join(', ')}
       ON CONFLICT ON CONSTRAINT notification_deliveries_once_per_event DO NOTHING
       RETURNING ${NOTIFICATION_COLUMNS}`,
      parameters,
    );
    return rows.map(toNotification);
  }

  async listForRecipient(recipientUserId: string, limit: number): Promise<Notification[]> {
    const { rows } = await this.unitOfWork.client().query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_deliveries
        WHERE recipient_user_id = $1
        ORDER BY created_at DESC, id
        LIMIT $2`,
      [recipientUserId, limit],
    );
    return rows.map(toNotification);
  }

  async countUnread(recipientUserId: string): Promise<number> {
    const { rows } = await this.unitOfWork
      .client()
      .query<{ count: number }>(
        'SELECT count(*) AS count FROM notification_deliveries WHERE recipient_user_id = $1 AND read_at IS NULL',
        [recipientUserId],
      );
    return rows[0]?.count ?? 0;
  }

  async markRead(notificationId: string, recipientUserId: string, readAt: Date): Promise<Notification | null> {
    const { rows } = await this.unitOfWork.client().query<NotificationRow>(
      `UPDATE notification_deliveries
          SET read_at = COALESCE(read_at, GREATEST($3::timestamptz, created_at))
        WHERE id = $1 AND recipient_user_id = $2
        RETURNING ${NOTIFICATION_COLUMNS}`,
      [notificationId, recipientUserId, readAt],
    );
    return rows[0] ? toNotification(rows[0]) : null;
  }
}

function toNotification(row: NotificationRow): Notification {
  const payload = auctionOutcomeNotificationPayloadSchema.safeParse(row.payload);
  if (!payload.success) {
    throw new InvariantViolationError('A stored notification has a malformed payload.', { notificationId: row.id });
  }
  return {
    id: row.id,
    eventId: row.event_id,
    recipientUserId: row.recipient_user_id,
    kind: row.kind,
    payload: payload.data,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}
