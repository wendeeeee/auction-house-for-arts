import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { API_PREFIX, createOpenApiDocument } from '../src/app.setup';

const OUTPUT_PATH = resolve(__dirname, '../../docs/openapi.json');

/**
 * `npm run docs:openapi`: writes the OpenAPI document to docs/openapi.json without starting a
 * server. The pg Pool connects lazily, so no database connection is opened either.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false });
  app.setGlobalPrefix(API_PREFIX);
  const document = createOpenApiDocument(app);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`wrote ${OUTPUT_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
