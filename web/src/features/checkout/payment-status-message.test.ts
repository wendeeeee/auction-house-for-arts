import { describe, expect, it } from 'vitest';
import { describePaymentStatus } from './payment-status-message';

const buyer = { role: 'buyer', purchaseId: null, amountCents: 1_234_57, currency: 'usd', paidAt: null } as const;

describe('describePaymentStatus', () => {
  it('asks the winner to pay the amount due', () => {
    expect(describePaymentStatus({ ...buyer, status: 'awaiting_payment' })).toMatchObject({
      headline: '$1,234.57 to pay',
      canPay: true,
    });
  });

  it('confirms the winner’s payment and offers no second payment', () => {
    expect(describePaymentStatus({ ...buyer, status: 'paid', paidAt: '2026-01-15T14:00:00.000Z' })).toMatchObject({
      headline: 'Paid $1,234.57',
      canPay: false,
    });
  });

  it('shows the seller only whether the buyer has paid', () => {
    expect(describePaymentStatus({ role: 'seller', status: 'awaiting_payment' })).toEqual({
      headline: 'Awaiting payment',
      detail: 'The winner has been asked to pay through checkout.',
      canPay: false,
    });
    expect(describePaymentStatus({ role: 'seller', status: 'paid' }).headline).toBe('The buyer has paid');
  });
});
