/**
 * Message Queue Priority System - Retry Helpers
 * Load retry policies and provide type-specific retry limits
 */

// Import retry policies (lazy to avoid circular deps)
let retryPolicies: any = null;
async function loadRetryPolicies() {
  if (!retryPolicies) {
    const policies = await import('../message-retry-and-dlq-system/retry-policy');
    retryPolicies = policies.DEFAULT_RETRY_POLICIES;
  }
  return retryPolicies;
}

/**
 * Get retry limit for a specific message type
 */
export async function getRetryLimitForType(type: import('./enums').MessageType): Promise<number> {
  const policies = await loadRetryPolicies();
  return policies[type]?.maxRetries ?? DEFAULT_MAX_RETRIES;
}

/**
 * Get base retry delay for a specific message type (in ms)
 */
export async function getRetryBaseDelayForType(type: import('./enums').MessageType): Promise<number> {
  const policies = await loadRetryPolicies();
  return policies[type]?.baseDelayMs ?? DEFAULT_RETRY_DELAY;
}

// Need to import defaults from config
import { DEFAULT_MAX_RETRIES, DEFAULT_RETRY_DELAY } from './config';
