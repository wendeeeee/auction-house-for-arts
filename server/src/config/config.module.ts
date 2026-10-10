import { Global, Module } from '@nestjs/common';
import { loadConfiguration } from './configuration';

/** Injection token for the validated `AppConfig`: `@Inject(APP_CONFIG) config: AppConfig`. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Validates the environment once, while the module graph is built, so a bad value stops the
 * process before it listens on a port or touches the database.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfiguration(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
