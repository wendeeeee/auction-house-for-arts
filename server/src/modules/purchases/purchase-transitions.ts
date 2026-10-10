import { PurchaseStatus } from './purchases.types';

export type PurchaseEvent = 'checkout_session_attached' | 'payment_confirmed';

const PURCHASE_TRANSITIONS: Record<PurchaseStatus, Partial<Record<PurchaseEvent, PurchaseStatus>>> = {
  pending: { checkout_session_attached: 'pending', payment_confirmed: 'paid' },
  paid: {},
};

export type PurchaseTransitionDecision =
  | { readonly isAllowed: true; readonly nextStatus: PurchaseStatus }
  | { readonly isAllowed: false };

export function decidePurchaseTransition(status: PurchaseStatus, event: PurchaseEvent): PurchaseTransitionDecision {
  const nextStatus = PURCHASE_TRANSITIONS[status][event];
  return nextStatus === undefined ? { isAllowed: false } : { isAllowed: true, nextStatus };
}
