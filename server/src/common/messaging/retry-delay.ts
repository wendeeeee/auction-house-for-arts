const BASE_RETRY_DELAY_MILLISECONDS = 1_000;
const MAXIMUM_RETRY_DELAY_MILLISECONDS = 10_000;

/** Without a pause, a requeued message would use up its delivery limit in milliseconds. */
export function computeRetryDelayMilliseconds(deliveryCount: number): number {
  const attempt = Math.max(1, Math.floor(deliveryCount));
  return Math.min(attempt * BASE_RETRY_DELAY_MILLISECONDS, MAXIMUM_RETRY_DELAY_MILLISECONDS);
}
