/**
 * Retry Delay Result
 *
 * Result of retry delay calculation.
 */

/**
 * Result of retry delay calculation
 */
export interface RetryDelayResult {
  /** Delay in milliseconds */
  delayMs: number;
  /** Actual jitter applied (0-1) */
  jitter: number;
  /** Attempt number (1-indexed) */
  attempt: number;
  /** Max attempts for this job type */
  maxAttempts: number;
}
