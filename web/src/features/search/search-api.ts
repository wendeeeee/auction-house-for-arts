import { apiClient } from '../../shared/api/api-client';
import type { SearchResultView } from './search-filters';

export function searchAuctions(params: URLSearchParams, signal: AbortSignal): Promise<SearchResultView> {
  return apiClient.get('/search', { query: Object.fromEntries(params), signal });
}
