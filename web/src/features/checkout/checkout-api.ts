import { apiClient } from '../../shared/api/api-client';
import type { CheckoutStatusView, StartedCheckoutView } from '../../shared/api/api-types';

export function startCheckout(slug: string): Promise<StartedCheckoutView> {
  return apiClient.post(`/auctions/${encodeURIComponent(slug)}/checkout`, {});
}

export function getCheckoutStatus(slug: string, signal: AbortSignal): Promise<CheckoutStatusView> {
  return apiClient.get(`/auctions/${encodeURIComponent(slug)}/checkout`, { signal });
}
