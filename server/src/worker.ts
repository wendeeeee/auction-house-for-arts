// See main.ts: tracing must start before any other import.
import { startTracing } from './common/tracing/tracing';
startTracing('art-auction-worker');

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CorrelatedConsoleLogger } from './common/logging';
import { WorkersModule } from './workers.module';

/**
 * Boots an application context with no HTTP server. Pollers and consumers registered in
 * `WorkersModule` start from their `onApplicationBootstrap` hooks and stop in their shutdown hooks.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkersModule, { logger: new CorrelatedConsoleLogger() });
  const logger = new Logger('Worker');
  logger.log('worker started');

  // Holds the process open until a stop signal, whatever is registered; then the shutdown hooks run.
  const keepAlive = setInterval(() => undefined, 60_000);
  const signal = await new Promise<NodeJS.Signals>((resolve) => {
    process.once('SIGTERM', () => resolve('SIGTERM'));
    process.once('SIGINT', () => resolve('SIGINT'));
  });
  clearInterval(keepAlive);
  logger.log(`received ${signal}, shutting down`);
  await app.close();
}

void bootstrap();
