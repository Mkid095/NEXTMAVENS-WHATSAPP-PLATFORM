/**
 * Retry Policy Engine - Barrel Export
 *
 * Provides retry delay calculation, eligibility checks, and metrics recording.
 * Original monolithic file split into logical operations.
 */

// Retry logic operations
export {
  calculateRetryDelay,
  getRetryPolicy,
  shouldRetry,
  shouldMoveToDlq,
  getRetrySummary,
  formatRetryDelay
} from './retry-logic.operations';

// Retry metrics operations
export {
  recordRetryAttempt,
  recordDlqMove
} from './retry-metrics.operations';

// Re-export types from types module (type-only)
export type {
  RetryPolicy,
  RetryDelayResult,
  ErrorCategory
} from './types';

// Re-export values from types module
export {
  DEFAULT_RETRY_POLICIES,
  classifyError,
  isRetryDlqEnabled
} from './types';
