import { Injectable } from '@nestjs/common';
import { PaymentEventRepository } from './payment-event.repository';
import { PaymentEventOutcome, ReceivedPaymentEvent } from './payment-events.types';

/** Both methods run inside the caller's transaction, so the record commits with what was done. */
@Injectable()
export class PaymentEventLog {
  constructor(private readonly paymentEventRepository: PaymentEventRepository) {}

  recordIfNew(event: ReceivedPaymentEvent): Promise<boolean> {
    return this.paymentEventRepository.insertIfNew(event);
  }

  recordOutcome(providerEventId: string, outcome: PaymentEventOutcome, details: Record<string, unknown> = {}): Promise<void> {
    return this.paymentEventRepository.recordOutcome(providerEventId, outcome, details);
  }
}
