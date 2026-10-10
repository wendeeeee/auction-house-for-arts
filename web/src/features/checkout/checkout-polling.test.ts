import { describe, expect, it } from 'vitest';
import { MAXIMUM_CHECKOUT_POLLS, decideCheckoutPoll } from './checkout-polling';

describe('decideCheckoutPoll', () => {
  it('stops as soon as the payment is confirmed', () => {
    expect(decideCheckoutPoll('paid', 0)).toBe('confirmed');
    expect(decideCheckoutPoll('paid', MAXIMUM_CHECKOUT_POLLS)).toBe('confirmed');
  });

  it('keeps polling while the webhook has not landed', () => {
    expect(decideCheckoutPoll('awaiting_payment', 0)).toBe('poll_again');
    expect(decideCheckoutPoll('awaiting_payment', MAXIMUM_CHECKOUT_POLLS - 1)).toBe('poll_again');
  });

  it('gives up after the limit instead of polling forever', () => {
    expect(decideCheckoutPoll('awaiting_payment', MAXIMUM_CHECKOUT_POLLS)).toBe('gave_up');
  });
});
