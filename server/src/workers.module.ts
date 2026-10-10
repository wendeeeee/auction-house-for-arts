import { Module } from '@nestjs/common';
import { ClockModule } from './common/clock';
import { TracingModule } from './common/tracing';
import { ConfigModule } from './config';
import { DatabaseModule } from './database';

/**
 * The background process's root module: shared infrastructure, no HTTP. Later phases register
 * their pollers (auction closing) and consumers (RabbitMQ, thumbnails) here.
 */
@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, TracingModule],
})
export class WorkersModule {}
