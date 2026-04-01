import type { RetryPolicy, RetryDelayResult } from './retry-policy.types';

const getPolicy = (messageType: string): RetryPolicy => {
  return DEFAULT_RETRY_POLICIES[messageType] || DEFAULT_RETRY_POLICIES.MESSAGE_UPSERT;
};

/**
 * Calculate retry delay using exponential backoff with jitter
 */
export function calculateRetryDelay(
  job: { name?: string },
  attempt: number,
  error: unknown
): RetryDelayResult {
  const messageType = job.name || 'MESSAGE_UPSERT';
  const policy = getPolicy(messageType);

  const exponentialDelay = policy.baseDelayMs * Math.pow(2, attempt - 1);
  const jitterSign = Math.random() < 0.5 ? -1 : 1;
  const jitterAmount = policy.jitterFactor * Math.random();
  const jitterMultiplier = 1 + jitterSign * jitterAmount;

  let delayMs = exponentialDelay * jitterMultiplier;
  delayMs = Math.min(delayMs, policy.maxDelayMs);
  delayMs = Math.max(delayMs, 100);

  return {
    delayMs: Math.floor(delayMs),
    attempt,
    jitter: jitterAmount * jitterSign
  };
}

/**
 * Format delay in human-readable form
 */
export function formatRetryDelay(delayMs: number): string {
  if (delayMs < 1000) {
    return `${delayMs}ms`;
  } else if (delayMs < 60000) {
    return `${(delayMs / 1000).toFixed(1)}s`;
  } else if (delayMs < 3600000) {
    return `${(delayMs / 60000).toFixed(1)}m`;
  } else {
    return `${(delayMs / 3600000).toFixed(1)}h`;
  }
}

import { DEFAULT_RETRY_POLICIES } from './retry-policy.types';
