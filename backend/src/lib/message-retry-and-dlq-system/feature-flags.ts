/**
 * Feature Flags for Retry and DLQ System
 */

export const FEATURE_FLAG_RETRY_DLQ = 'ENABLE_RETRY_DLQ';

/**
 * Check if retry/DLQ system is enabled
 */
export function isRetryDlqEnabled(): boolean {
  return process.env[FEATURE_FLAG_RETRY_DLQ] === 'true';
}
