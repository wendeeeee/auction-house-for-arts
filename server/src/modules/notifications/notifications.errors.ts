import { DomainError, ErrorCode } from '../../common/errors';

/** Also for someone else's notification, so IDs cannot be probed. */
export class NotificationNotFoundError extends DomainError {
  readonly code = ErrorCode.NOTIFICATION_NOT_FOUND;
  readonly httpStatus = 404;

  constructor(notificationId: string) {
    super('No such notification.', { notificationId });
  }
}
