import { Logger } from '@nestjs/common';

/** Runs `tick` repeatedly without overlap; `stop()` waits for the tick in flight. */
export class PollingLoop {
  private readonly logger: Logger;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private isStopped = false;

  constructor(
    name: string,
    private readonly intervalMilliseconds: number,
    private readonly tick: () => Promise<void>,
  ) {
    this.logger = new Logger(`PollingLoop:${name}`);
  }

  start(): void {
    this.isStopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.inFlight;
  }

  private schedule(delayMilliseconds: number): void {
    if (this.isStopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.inFlight = this.runTick().finally(() => {
        this.inFlight = null;
        this.schedule(this.intervalMilliseconds);
      });
    }, delayMilliseconds);
  }

  private async runTick(): Promise<void> {
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(`tick failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
