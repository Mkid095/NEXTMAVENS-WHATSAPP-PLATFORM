/**
 * DLQ Helper Utilities
 * Shared helper functions for DLQ operations
 */

/**
 * Convert flat Redis fields array [k1, v1, k2, v2] to [[k1, v1], [k2, v2]]
 */
export function pairsFromFlat(flat: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < flat.length; i += 2) {
    pairs.push([flat[i], flat[i + 1]]);
  }
  return pairs;
}

/**
 * Classify error for DLQ categorization
 */
export function classifyError(error: unknown): string {
  try {
    const { classifyError: classify } = require('../retry-policy');
    return classify(error);
  } catch {
    return (error as any)?.statusCode === 404 ? 'permanent' : 'transient';
  }
}

/**
 * Get retry count bucket for metrics aggregation
 */
export function getRetryCountBucket(retryCount: number): string {
  if (retryCount === 0) return '0';
  if (retryCount === 1) return '1';
  if (retryCount === 2) return '2';
  if (retryCount <= 5) return '3-5';
  if (retryCount <= 10) return '6-10';
  return '10+';
}
