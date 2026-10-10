import { Module } from '@nestjs/common';
import { ClockModule } from './common/clock';
import { TracingModule } from './common/tracing';
import { ConfigModule } from './config';
import { DatabaseModule } from './database';
import { AuctionClosePoller, ClosingModule } from './modules/closing';
import { ImageProcessingConsumer, ImagesModule } from './modules/images';
import { AuctionClosedConsumer, NotificationsModule, PurchasePaidConsumer } from './modules/notifications';
import { OutboxPublisherPoller, OutboxPublishingModule } from './modules/outbox';

/**
 * The background process's root module. Pollers and consumers are registered here only, so
 * none of them runs in the API process.
 */
@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    TracingModule,
    ClosingModule,
    OutboxPublishingModule,
    NotificationsModule,
    ImagesModule,
  ],
  providers: [AuctionClosePoller, OutboxPublisherPoller, AuctionClosedConsumer, PurchasePaidConsumer, ImageProcessingConsumer],
})
export class WorkersModule {}
