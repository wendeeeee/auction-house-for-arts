import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { BLOB_STORAGE, BlobStorage, InMemoryBlobStorage } from '../../src/modules/images';

export interface TestAppOptions {
  /** Swap providers before the module compiles, e.g. `builder.overrideProvider(Clock).useValue(fakeClock)`. */
  readonly configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /** Runs after `configureApp` and before `init`, e.g. to install a WebSocket adapter. */
  readonly beforeInit?: (app: NestFastifyApplication) => Promise<void>;
  /** Defaults to a fresh InMemoryBlobStorage: tests never reach S3. */
  readonly blobStorage?: BlobStorage;
}

/**
 * Boots the real AppModule with the same `configureApp` as production, without listening on a
 * port. Requests go through `app.inject()` (Fastify's in-process HTTP), so the full pipeline
 * runs: hooks, guards, pipes, the filter, and serialization.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestFastifyApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BLOB_STORAGE)
    .useValue(options.blobStorage ?? new InMemoryBlobStorage());
  const moduleRef = await (options.configure ? options.configure(builder) : builder).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
    // As in main.ts: webhook signatures are verified against the raw body.
    rawBody: true,
  });
  configureApp(app, { swaggerUiEnabled: false });
  if (options.beforeInit) await options.beforeInit(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
