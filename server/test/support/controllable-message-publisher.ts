import type { MessagePublisher, OutgoingMessage } from '../../src/common/messaging';

type ConfirmMode = 'confirm' | 'fail' | 'manual';

/** A fake confirm channel. In `manual` mode confirms wait for `confirmPending()` / `failPending()`. */
export class ControllableMessagePublisher implements MessagePublisher {
  readonly published: OutgoingMessage[] = [];
  mode: ConfirmMode = 'confirm';
  private pending: { resolve: () => void; reject: (error: Error) => void }[] = [];

  publish(message: OutgoingMessage): Promise<void> {
    this.published.push(message);
    if (this.mode === 'confirm') return Promise.resolve();
    if (this.mode === 'fail') return Promise.reject(new Error('nack from the fake broker'));
    return new Promise<void>((resolve, reject) => this.pending.push({ resolve, reject }));
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  confirmNext(): void {
    this.pending.shift()?.resolve();
  }

  failNext(): void {
    this.pending.shift()?.reject(new Error('nack from the fake broker'));
  }

  confirmPending(): void {
    for (const confirm of this.pending.splice(0)) confirm.resolve();
  }

  failPending(): void {
    for (const confirm of this.pending.splice(0)) confirm.reject(new Error('the channel closed before confirming'));
  }

  reset(): void {
    this.failPending();
    this.published.length = 0;
    this.mode = 'confirm';
  }
}
