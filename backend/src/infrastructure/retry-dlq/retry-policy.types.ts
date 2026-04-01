/**
 * Retry Policy Types
 */

/**
 * Configuration for retry behavior per message type
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts before moving to DLQ */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay between retries (cap for exponential growth) */
  maxDelayMs: number;
  /** Jitter factor (0-1) to add randomness and prevent thundering herd */
  jitterFactor: number;
}

/**
 * Default retry policies per message type
 */
export const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  MESSAGE_UPSERT: {
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 300000,
    jitterFactor: 0.15
  },
  MESSAGE_STATUS_UPDATE: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    jitterFactor: 0.15
  },
  MESSAGE_DELETE: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    jitterFactor: 0.15
  },
  INSTANCE_STATUS_UPDATE: {
    maxRetries: 2,
    baseDelayMs: 300,
    maxDelayMs: 30000,
    jitterFactor: 0.15
  },
  CONTACT_UPDATE: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    jitterFactor: 0.15
  },
  ANALYTICS_EVENT: {
    maxRetries: 2,
    baseDelayMs: 200,
    maxDelayMs: 10000,
    jitterFactor: 0.15
  },
  WEBHOOK_EVENT: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    jitterFactor: 0.15
  },
  DATABASE_CLEANUP: {
    maxRetries: 2,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    jitterFactor: 0.15
  },
  CACHE_REFRESH: {
    maxRetries: 2,
    baseDelayMs: 300,
    maxDelayMs: 30000,
    jitterFactor: 0.15
  }
};
