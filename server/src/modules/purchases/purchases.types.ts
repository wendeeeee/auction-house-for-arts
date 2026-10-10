import type { PaymentCurrency } from '../payments';

export const PURCHASE_STATUSES = ['pending', 'paid'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export interface Purchase {
  readonly id: string;
  readonly auctionId: string;
  readonly buyerUserId: string;
  readonly amountCents: number;
  readonly currency: PaymentCurrency;
  readonly status: PurchaseStatus;
  readonly providerSessionId: string | null;
  readonly createdAt: Date;
  readonly paidAt: Date | null;
}

export type CheckoutViewerRole = 'buyer' | 'seller' | 'none';

export interface StartedCheckout {
  readonly purchaseId: string;
  readonly amountCents: number;
  readonly currency: PaymentCurrency;
  readonly checkoutUrl: string;
}

export type CheckoutStatus =
  | {
      readonly role: 'buyer';
      readonly status: 'awaiting_payment' | 'paid';
      readonly purchaseId: string | null;
      readonly amountCents: number;
      readonly currency: PaymentCurrency;
      readonly paidAt: Date | null;
    }
  | { readonly role: 'seller'; readonly status: 'awaiting_payment' | 'paid' };
