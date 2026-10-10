import { Module, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTracing } from './tracing';

/**
 * Hooks span flushing into Nest's shutdown sequence, so Nest waits for it before the process
 * exits and the last requests' spans are not lost. A no-op when tracing never started.
 */
@Module({})
export class TracingModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownTracing();
  }
}
