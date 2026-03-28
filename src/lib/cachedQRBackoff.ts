/**
 * Cached QR Polling Backoff Logic
 *
 * Provides functions for exponential backoff and polling continuation
 * used by useCachedQR hook.
 */

const BASE_INTERVAL = 1000; // 1 second
const MAX_INTERVAL = 30000; // 30 seconds

/**
 * Calculate the polling interval based on retry count.
 * Uses exponential backoff: 1s → 2s → 4s → 8s → ... capped at 30s.
 *
 * @param retryCount - Number of retries so far (0 = first retry)
 * @returns Interval in milliseconds
 */
export function calculateBackoff(retryCount: number): number {
  if (retryCount < 0) {
    throw new Error('retryCount must be non-negative');
  }
  const interval = BASE_INTERVAL * Math.pow(2, retryCount);
  return Math.min(interval, MAX_INTERVAL);
}

/**
 * Determine whether polling should continue based on instance status.
 * Stops polling when status is terminal (CONNECTED or ERROR).
 *
 * @param status - Instance status from QR response
 * @returns true if polling should continue, false to stop
 */
export function shouldContinuePolling(status?: string): boolean {
  const TERMINAL_STATUSES = ['CONNECTED', 'ERROR'];
  return !TERMINAL_STATUSES.includes(status);
}
