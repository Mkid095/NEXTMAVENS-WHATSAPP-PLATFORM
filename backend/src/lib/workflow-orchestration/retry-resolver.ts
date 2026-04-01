/**
 * Workflow Retry - Resolver
 * Policy resolution and step type determination
 */

import type { RetryPolicy } from './types';
import { DEFAULT_RETRY_POLICIES } from './retry-policies.config';

/**
 * Get effective retry policy for a step
 * Merges workflow default with step-specific overrides
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
export function mergePolicies(base: RetryPolicy, override: RetryPolicy): RetryPolicy {
  return {
    maxAttempts: override.maxAttempts ?? base.maxAttempts,
    baseDelayMs: override.baseDelayMs ?? base.baseDelayMs,
    maxDelayMs: override.maxDelayMs ?? base.maxDelayMs,
    jitterFactor: override.jitterFactor ?? base.jitterFactor
  };
}

/**
 * Determine step type string from WorkflowStep action
 * Used to look up appropriate retry policy
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
      return 'default';

    case 'delay':
      return 'default';

    case 'parallel':
      return 'default';

    default:
      return 'default';
  }
}
