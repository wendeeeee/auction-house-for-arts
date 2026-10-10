import { z } from 'zod';
import { CheckoutStatus, StartedCheckout } from './purchases.types';

export const startedCheckoutViewSchema = z.object({
  purchaseId: z.uuid(),
  amountCents: z.number().int().describe('The hammer price; it never changes between attempts.'),
  currency: z.literal('usd'),
  checkoutUrl: z.url().describe('The provider’s hosted payment page.'),
});
export type StartedCheckoutView = z.infer<typeof startedCheckoutViewSchema>;

const paymentStatusSchema = z.enum(['awaiting_payment', 'paid']);

export const checkoutStatusViewSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('buyer'),
    status: paymentStatusSchema,
    purchaseId: z.uuid().nullable().describe('Null until checkout is first started.'),
    amountCents: z.number().int(),
    currency: z.literal('usd'),
    paidAt: z.iso.datetime().nullable(),
  }),
  z.object({ role: z.literal('seller'), status: paymentStatusSchema }),
]);
export type CheckoutStatusView = z.infer<typeof checkoutStatusViewSchema>;

export function toStartedCheckoutView(checkout: StartedCheckout): StartedCheckoutView {
  return { ...checkout };
}

export function toCheckoutStatusView(status: CheckoutStatus): CheckoutStatusView {
  if (status.role === 'seller') return { role: 'seller', status: status.status };
  return { ...status, paidAt: status.paidAt === null ? null : status.paidAt.toISOString() };
}
