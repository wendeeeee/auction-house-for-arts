// Tracing must start before `pg` and `http` are first required, so it comes before every other
// import. TypeScript compiles imports to `require` calls in source order, which keeps this first.
import { startTracing } from './common/tracing/tracing';
startTracing('art-auction-api');

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { CorrelatedConsoleLogger } from './common/logging';
import { APP_CONFIG, AppConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: new CorrelatedConsoleLogger(),
  });
  configureApp(app);
  // SIGTERM / SIGINT run the shutdown hooks: close the pool, flush spans.
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen({ port: config.api.port, host: '0.0.0.0' });
}

void bootstrap();
