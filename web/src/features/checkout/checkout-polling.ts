import type { PaymentStatus } from '../../shared/api/api-types';

export const CHECKOUT_POLL_INTERVAL_MILLISECONDS = 2_000;
export const MAXIMUM_CHECKOUT_POLLS = 30;

export type CheckoutPollDecision = 'confirmed' | 'poll_again' | 'gave_up';

/** The redirect back from Stripe proves nothing; only the webhook marks the purchase paid, so poll for it. */
export function decideCheckoutPoll(status: PaymentStatus, completedPolls: number): CheckoutPollDecision {
  if (status === 'paid') return 'confirmed';
  return completedPolls < MAXIMUM_CHECKOUT_POLLS ? 'poll_again' : 'gave_up';
}
