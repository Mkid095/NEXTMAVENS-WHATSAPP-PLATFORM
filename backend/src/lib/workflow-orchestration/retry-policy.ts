/**
 * Workflow Retry Policy
 * Provides retry configuration and decision logic for workflow steps
 */

import type { RetryPolicy } from './types';

// ============================================================================
// Default Retry Policies per step type
// ============================================================================

export const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  // Message-related steps
  'send-message': {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 300000, // 5 minutes
    jitterFactor: 0.15
  },
  'send-template': {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    jitterFactor: 0.15
  },
  // API calls
  'api-call': {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 120000,
    jitterFactor: 0.1
  },
  // Database operations
  'db-update': {
    maxAttempts: 3,
    baseDelayMs: 200,
    maxDelayMs: 30000,
    jitterFactor: 0.1
  },
  // Default fallback
  'default': {
    maxAttempts: 2,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    jitterFactor: 0.1
  }
};

// ============================================================================
// Retry Calculation
// ============================================================================

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
 *
 * @param attempt - Current attempt number (1-based)
 * @param error - Error that occurred (if any)
 * @param policy - Retry policy configuration
 * @returns true if should retry
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
 *
 * @param error - Error object to classify
 * @returns Error category
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

// ============================================================================
// Policy Resolution
// ============================================================================

/**
 * Get effective retry policy for a step
 * Merges workflow default with step-specific overrides
 *
 * @param stepType - Type of step (e.g., 'send-message', 'api-call')
 * @param stepPolicy - Step-specific policy (optional)
 * @param workflowPolicy - Workflow default policy (optional)
 * @returns Resolved retry policy
 */
export function resolveRetryPolicy(
  stepType: string,
  stepPolicy?: RetryPolicy,
  workflowPolicy?: RetryPolicy
): RetryPolicy {
  // Start with default for step type
  const typePolicy = DEFAULT_RETRY_POLICIES[stepType] || DEFAULT_RETRY_POLICIES['default'];

  // Merge workflow default (if provided)
  const basePolicy = workflowPolicy ? mergePolicies(typePolicy, workflowPolicy) : typePolicy;

  // Apply step-specific overrides (if provided)
  if (stepPolicy) {
    return mergePolicies(basePolicy, stepPolicy);
  }

  return basePolicy;
}

/**
 * Merge two retry policies (second overrides first)
 */
function mergePolicies(base: RetryPolicy, override: RetryPolicy): RetryPolicy {
  return {
    maxAttempts: override.maxAttempts ?? base.maxAttempts,
    baseDelayMs: override.baseDelayMs ?? base.baseDelayMs,
    maxDelayMs: override.maxDelayMs ?? base.maxDelayMs,
    jitterFactor: override.jitterFactor ?? base.jitterFactor
  };
}

// ============================================================================
// Step Type Determination
// ============================================================================

/**
 * Determine step type string from WorkflowStep action
 * Used to look up appropriate retry policy
 *
 * @param action - WorkflowStep action configuration
 * @returns Step type string for policy lookup
 */
export function getStepTypeFromAction(action: { type: string; config: Record<string, unknown> }): string {
  const { type, config } = action;

  switch (type) {
    case 'message':
      const messageType = config.messageType as string | undefined;
      if (messageType === 'template') return 'send-template';
      return 'send-message';

    case 'api-call':
      return 'api-call';

    case 'queue-job':
      return 'api-call'; // Use same policy as API calls

    case 'custom':
      // Custom handlers should specify retry policy explicitly
      return 'default';

    case 'delay':
      return 'default'; // Delays shouldn't retry, but default applies

    case 'parallel':
      return 'default';

    default:
      return 'default';
  }
}
