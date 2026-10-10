import { Module } from '@nestjs/common';
import { EarningsController } from './earnings.controller';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';

@Module({
  controllers: [EarningsController],
  providers: [LedgerRepository, LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
