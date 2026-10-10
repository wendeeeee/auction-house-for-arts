import { Global } from '@nestjs/common';
import { Module } from '@nestjs/common/decorators/modules/module.decorator';
import { Clock, SystemClock } from './clock';

@Global()
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class ClockModule {}
