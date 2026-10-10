import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';
import { DATABASE_POOL, createDatabasePool } from './database-pool';
import { UnitOfWork } from './unit-of-work';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Pool => {
        const pool = createDatabasePool({
          connectionString: config.database.url,
          max: config.database.poolMax,
        });
        // An idle client can error (the server restarted). Without a listener, pg's 'error'
        // event would crash the process; the pool already discards the broken client.
        pool.on('error', (error) => new Logger('DatabasePool').error(`Idle client error: ${error.message}`));
        return pool;
      },
    },
    UnitOfWork,
  ],
  exports: [DATABASE_POOL, UnitOfWork],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /** Requires `app.enableShutdownHooks()`; closes connections so SIGTERM leaves cleanly. */
  async onApplicationShutdown(): Promise<void> {
    if (!this.pool.ended) await this.pool.end();
  }
}
