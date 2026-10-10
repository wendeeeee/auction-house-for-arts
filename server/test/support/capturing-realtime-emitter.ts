import type { RealtimeEmitter } from '../../src/modules/realtime';

export interface CapturedEmit {
  readonly room: 'user' | 'auction';
  readonly target: string;
  readonly eventName: string;
  readonly payload: unknown;
}

export class CapturingRealtimeEmitter implements RealtimeEmitter {
  readonly emits: CapturedEmit[] = [];

  emitToUser(userId: string, eventName: string, payload: unknown): void {
    this.emits.push({ room: 'user', target: userId, eventName, payload });
  }

  emitToAuction(slug: string, eventName: string, payload: unknown): void {
    this.emits.push({ room: 'auction', target: slug, eventName, payload });
  }

  clear(): void {
    this.emits.length = 0;
  }
}
