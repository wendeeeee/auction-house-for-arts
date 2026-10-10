import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser, CurrentUser, RequireUser } from '../../common/identity';
import { ZodValidationPipe, toOpenApiSchema } from '../../common/validation';
import { NotificationService } from './notification.service';
import {
  NotificationListView,
  NotificationView,
  notificationListViewSchema,
  notificationViewSchema,
  toNotificationView,
} from './notification.view';

const notificationIdSchema = z.uuid({ error: 'must be a notification ID' });

@ApiTags('notifications')
@Controller('notifications')
@RequireUser()
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'Your notifications, newest first, with the unread count',
    description: 'Auction outcomes are stored here when they happen, so you see them even if you were offline.',
  })
  @ApiOkResponse({ schema: toOpenApiSchema(notificationListViewSchema) })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' })
  async listNotifications(@CurrentUser() user: AuthenticatedUser | null): Promise<NotificationListView> {
    if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
    const inbox = await this.notificationService.getInbox(user);
    return { items: inbox.notifications.map(toNotificationView), unreadCount: inbox.unreadCount };
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark one of your notifications read (idempotent)' })
  @ApiOkResponse({ schema: toOpenApiSchema(notificationViewSchema) })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' })
  @ApiNotFoundResponse({ description: 'NOTIFICATION_NOT_FOUND, also for another user’s notification' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id', new ZodValidationPipe(notificationIdSchema)) notificationId: string,
  ): Promise<NotificationView> {
    if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
    return toNotificationView(await this.notificationService.markRead(user, notificationId));
  }
}
