import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../../database';

export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  readonly status: 'ok' | 'unavailable';
  readonly checks: { readonly database: DependencyStatus };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async checkHealth(): Promise<HealthReport> {
    const database = await this.checkDatabase();
    return { status: database === 'up' ? 'ok' : 'unavailable', checks: { database } };
  }

  /** The pool's connection timeout bounds this, so a dead database answers "down" within seconds. */
  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.pool.query('SELECT 1');
      return 'up';
    } catch (error) {
      this.logger.warn(`Database health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return 'down';
    }
  }
}
