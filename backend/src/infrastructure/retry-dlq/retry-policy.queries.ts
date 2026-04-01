import type { RetryPolicy } from './retry-policy.types';
import { DEFAULT_RETRY_POLICIES } from './retry-policy.types';

/**
 * Get retry policy for a message type
 */
export function getRetryPolicy(messageType: string): RetryPolicy {
  return DEFAULT_RETRY_POLICIES[messageType] || DEFAULT_RETRY_POLICIES.MESSAGE_UPSERT;
}

/**
 * Get summary of retry attempts for monitoring
 */
export function getRetrySummary(attempts: number[]): {
  total: number;
  average: number;
  max: number;
  distribution: Record<string, number>;
} {
  if (attempts.length === 0) {
    return { total: 0, average: 0, max: 0, distribution: {} };
  }

  const total = attempts.reduce((sum, a) => sum + a, 0);
  const average = total / attempts.length;
  const max = Math.max(...attempts);

  const distribution: Record<string, number> = {
    '0': 0,
    '1': 0,
    '2-3': 0,
    '4-10': 0,
    '11+': 0
  };

  for (const attempt of attempts) {
    if (attempt === 0) distribution['0']++;
    else if (attempt === 1) distribution['1']++;
    else if (attempt <= 3) distribution['2-3']++;
    else if (attempt <= 10) distribution['4-10']++;
    else distribution['11+']++;
  }

  return { total, average, max, distribution };
}
