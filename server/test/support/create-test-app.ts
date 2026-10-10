import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export interface TestAppOptions {
  /** Swap providers before the module compiles, e.g. `builder.overrideProvider(Clock).useValue(fakeClock)`. */
  readonly configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * Boots the real AppModule with the same `configureApp` as production, without listening on a
 * port. Requests go through `app.inject()` (Fastify's in-process HTTP), so the full pipeline
 * runs: hooks, guards, pipes, the filter, and serialization.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestFastifyApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (options.configure ? options.configure(builder) : builder).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
  configureApp(app, { swaggerUiEnabled: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
