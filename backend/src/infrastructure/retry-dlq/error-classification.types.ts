/**
 * Error Classification Types
 */

import type { Job } from 'bullmq';

/**
 * Classification of errors for retry decisions
 */
export enum ErrorCategory {
  TRANSIENT = 'transient',
  PERMANENT = 'permanent',
  UNKNOWN = 'unknown'
}

/**
 * Rules for classifying errors into categories
 */
export const ERROR_CLASSIFICATION_RULES = {
  // HTTP status codes that indicate permanent failures
  permanentStatusCodes: [400, 401, 403, 404, 410],
  // Error messages that indicate transient failures
  transientPatterns: [
    /timeout/i,
    /connection/i,
    /network/i,
    /econnreset/i,
    /unavailable/i,
    /retry/i
  ]
};

/**
 * Feature flag for DLQ system
 */
export const FEATURE_FLAG_RETRY_DLQ = process.env.ENABLE_RETRY_DLQ === 'true';

/**
 * Check if DLQ is enabled
 */
export function isRetryDlqEnabled(): boolean {
  return FEATURE_FLAG_RETRY_DLQ;
}

/**
 * Classify an error into a category
 * Determines whether a job should be retried or sent to DLQ
 */
export function classifyError(error: unknown): ErrorCategory {
  if (!error) return ErrorCategory.UNKNOWN;

  const err = error as any;

  // Check for HTTP status code
  if (err.statusCode) {
    if (ERROR_CLASSIFICATION_RULES.permanentStatusCodes.includes(err.statusCode)) {
      return ErrorCategory.PERMANENT;
    }
  }

  // Check error message for transient patterns
  const message = err.message || String(err);
  if (ERROR_CLASSIFICATION_RULES.transientPatterns.some(pattern => pattern.test(message))) {
    return ErrorCategory.TRANSIENT;
  }

  return ErrorCategory.UNKNOWN;
}
