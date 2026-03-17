/**
 * Retry Policy Engine
 * Calculates retry delays with exponential backoff and jitter
 */

import {
  RetryPolicy,
  RetryDelayResult,
  DEFAULT_RETRY_POLICIES,
  classifyError,
  ErrorCategory,
  isRetryDlqEnabled
} from './types';

// ============================================================================
// Configuration
// ============================================================================

const getPolicy = (messageType: string): RetryPolicy => {
  return DEFAULT_RETRY_POLICIES[messageType] || DEFAULT_RETRY_POLICIES.MESSAGE_UPSERT;
};

// ============================================================================
// Retry Delay Calculation
// ============================================================================

/**
 * Calculate the retry delay for a failed job using exponential backoff with jitter
 *
 * Formula: delay = min(base * (2^attempt) * (1 ± jitter), maxDelay)
 *
 * @param job - The failed BullMQ job
 * @param attempt - Current retry attempt (1-indexed)
 * @param error - The error that caused the failure (for classification)
 * @returns RetryDelayResult with calculated delay and metadata
 */
export function calculateRetryDelay(
  job: { name?: string },
  attempt: number,
  error: unknown
): RetryDelayResult {
  const messageType = job.name || 'MESSAGE_UPSERT';
  const policy = getPolicy(messageType);

  // Exponential backoff: base * (2 ^ (attempt - 1))
  const exponentialDelay = policy.baseDelayMs * Math.pow(2, attempt - 1);

  // Apply jitter: multiply by (1 ± random jitter factor)
  const jitterSign = Math.random() < 0.5 ? -1 : 1;
  const jitterAmount = policy.jitterFactor * Math.random();
  const jitterMultiplier = 1 + jitterSign * jitterAmount;

  let delayMs = exponentialDelay * jitterMultiplier;

  // Cap at max delay
  delayMs = Math.min(delayMs, policy.maxDelayMs);

  // Ensure minimum delay of 100ms to prevent immediate retries
  delayMs = Math.max(delayMs, 100);

  return {
    delayMs: Math.floor(delayMs),
    jitter: jitterAmount,
    attempt,
    maxAttempts: policy.maxRetries
  };
}

/**
 * Get retry policy for a specific message type
 */
export function getRetryPolicy(messageType: string): RetryPolicy {
  return getPolicy(messageType);
}

/**
 * Check if a job should be retried based on error classification and attempt count
 *
 * @param job - The BullMQ job
 * @param attempt - Current retry attempt (1-indexed)
 * @param error - The error that occurred
 * @returns True if the job should be retried, false if it should go to DLQ
 */
export function shouldRetry(
  job: { name?: string },
  attempt: number,
  error: unknown
): boolean {
  // If retry/DLQ system is disabled, always retry (backward compatibility)
  if (!isRetryDlqEnabled()) {
    return true;
  }

  const messageType = job.name || 'MESSAGE_UPSERT';
  const policy = getPolicy(messageType);
  const errorCategory = classifyError(error);

  // Permanent errors should never be retried
  if (errorCategory === ErrorCategory.PERMANENT) {
    return false;
  }

  // Check if we've exceeded the retry limit
  if (attempt > policy.maxRetries) {
    return false;
  }

  // Transient and unknown errors can be retried if under limit
  return true;
}

/**
 * Determine if a job should be moved to DLQ immediately
 *
 * @param job - The BullMQ job
 * @param attempt - Current retry attempt (1-indexed)
 * @param error - The error that occurred
 * @returns True if job should be moved to DLQ
 */
export function shouldMoveToDlq(
  job: { name?: string },
  attempt: number,
  error: unknown
): boolean {
  return !shouldRetry(job, attempt, error);
}

// ============================================================================
// Metrics Integration
// ============================================================================

// Import metrics lazily to avoid circular dependencies
let retryMetrics: any = null;
let dlqMetrics: any = null;

function getRetryMetrics() {
  if (!retryMetrics) {
    // Dynamic import to avoid circular deps
    const metrics = require('../create-comprehensive-metrics-dashboard-(grafana)/index');
    retryMetrics = {
      queueJobsRetryTotal: metrics.queueJobsRetryTotal,
      queueJobsRetryDelaySeconds: metrics.queueJobsRetryDelaySeconds || createRetryDelayHistogram()
    };
  }
  return retryMetrics;
}

function createRetryDelayHistogram() {
  const { Histogram } = require('prom-client');
  const histogram = new Histogram({
    name: 'whatsapp_platform_queue_retry_delay_seconds',
    help: 'Retry delay distribution in seconds',
    labelNames: ['message_type', 'attempt'],
    buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300]
  });
  return histogram;
}

/**
 * Record retry attempt for metrics
 */
export function recordRetryAttempt(messageType: string, attempt: number, delayMs: number): void {
  try {
    const metrics = getRetryMetrics();
    const delaySeconds = delayMs / 1000;
    metrics.queueJobsRetryTotal.inc({ message_type: messageType });
    metrics.queueJobsRetryDelaySeconds.observe(
      { message_type: messageType, attempt: attempt.toString() },
      delaySeconds
    );
  } catch (error) {
    console.warn('[RetryPolicy] Failed to record retry metrics:', error);
  }
}

/**
 * Record DLQ movement for metrics
 */
export function recordDlqMove(messageType: string, errorCategory: ErrorCategory): void {
  try {
    const metrics = require('../create-comprehensive-metrics-dashboard-(grafana)/index');
    if (metrics.queueDlqSize) {
      // This is a gauge that should be incremented when messages enter DLQ
      // Note: We'll need to implement a separate collector for DLQ size that polls Redis
      // For now, we just record the event
    }
    if (metrics.messageFailureReasonTotal) {
      metrics.messageFailureReasonTotal.inc({
        message_type: messageType,
        error_category: errorCategory
      });
    }
  } catch (error) {
    console.warn('[RetryPolicy] Failed to record DLQ metrics:', error);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format delay for logging
 */
export function formatRetryDelay(delayMs: number): string {
  if (delayMs < 1000) {
    return `${delayMs}ms`;
  } else if (delayMs < 60000) {
    return `${(delayMs / 1000).toFixed(1)}s`;
  } else {
    return `${(delayMs / 60000).toFixed(1)}m`;
  }
}

/**
 * Get retry summary for a job
 */
export function getRetrySummary(
  job: { name?: string },
  attemptsMade: number,
  error?: unknown
): {
  shouldRetry: boolean;
  remainingRetries: number;
  errorCategory: ErrorCategory;
  nextDelay?: RetryDelayResult;
} {
  const messageType = job.name || 'MESSAGE_UPSERT';
  const policy = getPolicy(messageType);
  const errorCategory = error ? classifyError(error) : ErrorCategory.UNKNOWN;
  const shouldRetry = errorCategory === ErrorCategory.TRANSIENT && attemptsMade < policy.maxRetries;
  const remainingRetries = policy.maxRetries - attemptsMade;

  let nextDelay: RetryDelayResult | undefined;
  if (shouldRetry) {
    nextDelay = calculateRetryDelay(job, attemptsMade + 1, error);
  }

  return {
    shouldRetry,
    remainingRetries,
    errorCategory,
    nextDelay
  };
}

// Re-export isRetryDlqEnabled for consumers
export { isRetryDlqEnabled } from './types';
// Re-export DEFAULT_RETRY_POLICIES for consumers (e.g., message-queue-priority-system)
export { DEFAULT_RETRY_POLICIES } from './types';
