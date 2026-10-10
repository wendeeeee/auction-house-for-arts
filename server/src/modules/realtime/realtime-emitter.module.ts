import { Module } from '@nestjs/common';
import { REALTIME_EMITTER, RedisRealtimeEmitter } from './realtime-emitter';

@Module({
  providers: [{ provide: REALTIME_EMITTER, useClass: RedisRealtimeEmitter }],
  exports: [REALTIME_EMITTER],
})
export class RealtimeEmitterModule {}
