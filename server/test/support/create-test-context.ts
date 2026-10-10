import type { ModuleMetadata } from '@nestjs/common';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import { ClockModule } from '../../src/common/clock';
import { TracingModule } from '../../src/common/tracing';
import { ConfigModule } from '../../src/config';
import { DatabaseModule } from '../../src/database';
import { BLOB_STORAGE, BlobStorage, InMemoryBlobStorage } from '../../src/modules/images';

export interface TestContextOptions {
  readonly imports: NonNullable<ModuleMetadata['imports']>;
  readonly configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /** Defaults to a fresh InMemoryBlobStorage: tests never reach S3. */
  readonly blobStorage?: BlobStorage;
}

/** Infrastructure plus the given modules, without WorkersModule's pollers. */
export async function createTestContext(options: TestContextOptions): Promise<TestingModule> {
  const builder = Test.createTestingModule({
    imports: [ConfigModule, ClockModule, DatabaseModule, TracingModule, ...options.imports],
  })
    .overrideProvider(BLOB_STORAGE)
    .useValue(options.blobStorage ?? new InMemoryBlobStorage());
  const moduleRef = await (options.configure ? options.configure(builder) : builder).compile();
  moduleRef.useLogger(false);
  await moduleRef.init();
  return moduleRef;
}
