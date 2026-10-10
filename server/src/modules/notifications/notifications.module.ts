import { Module } from '@nestjs/common';
import { RealtimeEmitterModule } from '../realtime';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [RealtimeEmitterModule],
  controllers: [NotificationsController],
  providers: [NotificationRepository, NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
