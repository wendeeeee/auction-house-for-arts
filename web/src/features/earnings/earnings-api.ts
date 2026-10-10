import { apiClient } from '../../shared/api/api-client';
import type { EarningsView } from '../../shared/api/api-types';

export function getEarnings(signal: AbortSignal): Promise<EarningsView> {
  return apiClient.get('/me/earnings', { signal });
}
