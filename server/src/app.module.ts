import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClockModule } from './common/clock';
import { DemoIdentityGuard } from './common/identity';
import { TracingModule } from './common/tracing';
import { ConfigModule } from './config';
import { DatabaseModule } from './database';
import { ArtistsModule } from './modules/artists';
import { ArtworksModule } from './modules/artworks';
import { AuctionsModule } from './modules/auctions';
import { ClosingModule } from './modules/closing';
import { HealthModule } from './modules/health';
import { LedgerModule } from './modules/ledger';
import { NotificationsModule } from './modules/notifications';
import { PurchasesModule } from './modules/purchases';
import { UsersModule } from './modules/users';

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    TracingModule,
    HealthModule,
    UsersModule,
    ArtistsModule,
    ArtworksModule,
    AuctionsModule,
    ClosingModule,
    NotificationsModule,
    LedgerModule,
    PurchasesModule,
  ],
  providers: [
    // Global: every route resolves X-Demo-User-Id; @RequireUser() routes also reject anonymous.
    // IDENTITY_LOOKUP comes from UsersModule's exports.
    { provide: APP_GUARD, useClass: DemoIdentityGuard },
  ],
})
export class AppModule {}
