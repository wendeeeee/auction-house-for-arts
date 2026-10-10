import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../database';
import { PaymentEventOutcome, ReceivedPaymentEvent } from './payment-events.types';

/** Owns the `payment_events` table. */
@Injectable()
export class PaymentEventRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /**
   * False for an event already recorded. A concurrent duplicate waits on the primary key until
   * the first transaction ends, then gets false (or true, if the first rolled back).
   */
  async insertIfNew(event: ReceivedPaymentEvent): Promise<boolean> {
    const { rowCount } = await this.unitOfWork.requireTransaction().query(
      `INSERT INTO payment_events (provider_event_id, event_type, provider_session_id, claimed_purchase_id, outcome, received_at)
       VALUES ($1, $2, $3, $4, 'received', $5)
       ON CONFLICT (provider_event_id) DO NOTHING`,
      [event.providerEventId, event.eventType, event.providerSessionId, event.claimedPurchaseId, event.receivedAt],
    );
    return rowCount === 1;
  }

  async recordOutcome(providerEventId: string, outcome: PaymentEventOutcome, details: Record<string, unknown>): Promise<void> {
    await this.unitOfWork
      .requireTransaction()
      .query('UPDATE payment_events SET outcome = $2, details = $3 WHERE provider_event_id = $1', [
        providerEventId,
        outcome,
        JSON.stringify(details),
      ]);
  }
}
