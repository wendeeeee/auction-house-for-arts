import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { AuthenticatedUser } from '../../common/identity';
import { withSpan } from '../../common/tracing';
import { AuctionClosedPayload, PurchasePaidPayload } from '../outbox';
import { NOTIFICATION_CREATED_EVENT, REALTIME_EMITTER, RealtimeEmitter } from '../realtime';
import { decideNotificationRecipients } from './notification-recipients';
import { NotificationRepository } from './notification.repository';
import { decidePurchasePaidRecipients } from './purchase-paid-recipients';
import { toNotificationView } from './notification.view';
import { Notification } from './notifications.types';
import { NotificationNotFoundError } from './notifications.errors';

const INBOX_LIMIT = 50;

export interface Inbox {
  readonly notifications: readonly Notification[];
  readonly unreadCount: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly clock: Clock,
    @Inject(REALTIME_EMITTER) private readonly realtimeEmitter: RealtimeEmitter,
  ) {}

  /** Store first, then alert only what was newly stored, so a redelivery alerts no one again. */
  async deliverAuctionClosed(eventId: string, event: AuctionClosedPayload): Promise<Notification[]> {
    return withSpan('notifications.deliver_auction_closed', { 'event.id': eventId, 'auction.slug': event.auctionSlug }, async () => {
      const createdAt = this.clock.now();
      const created = await this.notificationRepository.insertIfNew(
        decideNotificationRecipients(event).map((recipient) => ({
          eventId,
          recipientUserId: recipient.recipientUserId,
          kind: recipient.kind,
          payload: {
            auctionSlug: event.auctionSlug,
            artworkTitle: event.artworkTitle,
            outcome: event.outcome,
            hammerPriceCents: event.hammerPriceCents,
          },
          createdAt,
        })),
      );
      for (const notification of created) this.alert(notification);
      return created;
    });
  }

  async deliverPurchasePaid(eventId: string, event: PurchasePaidPayload): Promise<Notification[]> {
    return withSpan('notifications.deliver_purchase_paid', { 'event.id': eventId, 'auction.slug': event.auctionSlug }, async () => {
      const createdAt = this.clock.now();
      const created = await this.notificationRepository.insertIfNew(
        decidePurchasePaidRecipients(event).map((recipient) => ({
          eventId,
          recipientUserId: recipient.recipientUserId,
          kind: recipient.kind,
          payload: {
            auctionSlug: event.auctionSlug,
            artworkTitle: event.artworkTitle,
            outcome: 'sold' as const,
            hammerPriceCents: event.amountCents,
            earnedCents: recipient.earnedCents,
          },
          createdAt,
        })),
      );
      for (const notification of created) this.alert(notification);
      return created;
    });
  }

  async getInbox(user: AuthenticatedUser): Promise<Inbox> {
    const [notifications, unreadCount] = await Promise.all([
      this.notificationRepository.listForRecipient(user.id, INBOX_LIMIT),
      this.notificationRepository.countUnread(user.id),
    ]);
    return { notifications, unreadCount };
  }

  async markRead(user: AuthenticatedUser, notificationId: string): Promise<Notification> {
    const notification = await this.notificationRepository.markRead(notificationId, user.id, this.clock.now());
    if (!notification) throw new NotificationNotFoundError(notificationId);
    return notification;
  }

  /** Best effort: the notification is already stored. */
  private alert(notification: Notification): void {
    try {
      this.realtimeEmitter.emitToUser(notification.recipientUserId, NOTIFICATION_CREATED_EVENT, toNotificationView(notification));
    } catch (error) {
      this.logger.error(`Could not alert about notification ${notification.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
