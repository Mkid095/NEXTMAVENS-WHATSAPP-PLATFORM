/**
 * Message Retry and DLQ System - Type Definitions (Barrel Export)
 *
 * This file re-exports all types from specialized modules.
 * Original monolithic file split into multiple files for maintainability.
 */

// Retry policy types and defaults
export type { RetryPolicy } from './retry-policy.types';
export { DEFAULT_RETRY_POLICIES } from './retry-policy.types';

// Error classification
export { ErrorCategory, ERROR_CLASSIFICATION_RULES, classifyError } from './error-classification.types';

// DLQ types
export type {
  DlqMetadata,
  DlqEntry,
  DlqQueryOptions,
  DlqMetrics
} from './dlq.types';

// Retry delay result
export type { RetryDelayResult } from './retry-delay.types';

// Feature flags
export {
  FEATURE_FLAG_RETRY_DLQ,
  isRetryDlqEnabled
} from './feature-flags';
