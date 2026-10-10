import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PollingLoop } from '../../common/polling';
import { AuctionCloseService } from './auction-close.service';

const CLOSE_POLL_INTERVAL_MILLISECONDS = 1_000;

@Injectable()
export class AuctionClosePoller implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(AuctionClosePoller.name);
  private readonly loop: PollingLoop;

  constructor(private readonly auctionCloseService: AuctionCloseService) {
    this.loop = new PollingLoop('auction-close', CLOSE_POLL_INTERVAL_MILLISECONDS, async () => {
      const summary = await this.auctionCloseService.closeDueAuctions();
      if (summary.closed > 0 || summary.failed > 0) {
        this.logger.log(`closed ${summary.closed} auction(s), ${summary.failed} failed`);
      }
    });
  }

  onApplicationBootstrap(): void {
    this.loop.start();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.loop.stop();
  }
}
