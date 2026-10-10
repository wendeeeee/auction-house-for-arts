export const PAYMENT_EVENT_OUTCOMES = [
  'settled',
  'ignored_event_type',
  'unknown_purchase',
  'already_paid',
  'session_mismatch',
  'not_paid',
  'amount_mismatch',
  'currency_mismatch',
] as const;
export type PaymentEventOutcome = (typeof PAYMENT_EVENT_OUTCOMES)[number];

export interface ReceivedPaymentEvent {
  readonly providerEventId: string;
  readonly eventType: string;
  readonly providerSessionId: string | null;
  readonly claimedPurchaseId: string | null;
  readonly receivedAt: Date;
}
