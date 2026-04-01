/**
 * Workflow Retry - Calculator
 * Functions for calculating retry delays and evaluating retry decisions
 */

import type { RetryPolicy } from './types';

/**
 * Calculate retry delay using exponential backoff with jitter
 *
 * Formula: delay = min(base * 2^(attempt-1) * (1 ± jitter), maxDelay)
 *
 * @param attempt - Current attempt number (1-based)
 * @param policy - Retry policy configuration
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
  if (attempt <= 1) {
    return 0; // No delay for first attempt
  }

  const exponentialDelay = policy.baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = exponentialDelay * policy.jitterFactor * (Math.random() * 2 - 1); // ± jitter
  const delayed = exponentialDelay + jitter;
  const capped = Math.min(delayed, policy.maxDelayMs);

  return Math.max(0, Math.floor(capped));
}

/**
 * Determine if a step should be retried based on error and attempt count
 */
export function shouldRetry(attempt: number, error: unknown | null, policy: RetryPolicy): boolean {
  // If no error and attempt > 1, this is likely a manual retry - allow
  if (!error && attempt > 1) {
    return true;
  }

  // Check if we've exceeded max attempts
  if (attempt > policy.maxAttempts) {
    return false;
  }

  // If no error but attempt is 1, doesn't need retry
  if (!error) {
    return false;
  }

  // Classify error
  const errorCategory = classifyError(error);

  // Transient errors should be retried
  if (errorCategory === 'transient') {
    return true;
  }

  // Permanent errors should not be retried
  if (errorCategory === 'permanent') {
    return false;
  }

  // Unknown errors - conservative approach: retry up to maxAttempts
  return attempt <= Math.min(2, policy.maxAttempts);
}

/**
 * Classify an error as transient, permanent, or unknown
 */
export function classifyError(error: unknown): 'transient' | 'permanent' | 'unknown' {
  if (!error) return 'unknown';

  const err = error as Error;
  const message = err.message?.toLowerCase() || '';
  const name = err.name?.toLowerCase() || '';

  // Check status code if available
  const statusCode = (err as any).statusCode || (err as any).code;
  if (typeof statusCode === 'number') {
    // Transient: 408, 429, 5xx
    if ([408, 429, 500, 502, 503, 504].includes(statusCode)) {
      return 'transient';
    }
    // Permanent: 400, 401, 403, 404, 422
    if ([400, 401, 403, 404, 422].includes(statusCode)) {
      return 'permanent';
    }
  }

  // Transient patterns
  const transientPatterns = [
    /timeout/i,
    /deadlock/i,
    /connection\s+refused/i,
    /network\s+error/i,
    /redis\s+connection/i,
    /temporarily\s+unavailable/i,
    /service\s+unavailable/i,
    /try\s+again/i,
    /retryable/i
  ];

  for (const pattern of transientPatterns) {
    if (pattern.test(message) || pattern.test(name)) {
      return 'transient';
    }
  }

  // Permanent patterns
  const permanentPatterns = [
    /validation\s+error/i,
    /invalid\s+payload/i,
    /malformed/i,
    /unauthorized/i,
    /forbidden/i,
    /not\s+found/i,
    /quota\s+exceeded/i,
    /rate\s+limit/i,
    /syntax\s+error/i,
    /duplicate/i,
    /constraint/i
  ];

  for (const pattern of permanentPatterns) {
    if (pattern.test(message) || pattern.test(name)) {
      return 'permanent';
    }
  }

  // Database-specific checks
  const anyErr = err as any;
  if (anyErr.code === 'P2002') {
    // Duplicate key
    return 'permanent';
  }
  if (anyErr.code === 'P2003') {
    // Foreign key constraint
    return 'permanent';
  }

  return 'unknown';
}
