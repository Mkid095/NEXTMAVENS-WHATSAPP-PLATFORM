import { ErrorCategory } from './types';

// In-memory metrics tracking (could be replaced with Prometheus counters)
const retryAttempts: Map<string, number[]> = new Map();
const dlqMoves: Map<string, { category: ErrorCategory; count: number }> = new Map();

/**
 * Record a retry attempt for a message type
 */
export function recordRetryAttempt(
  messageType: string,
  attempt: number,
  delayMs: number
): void {
  if (!retryAttempts.has(messageType)) {
    retryAttempts.set(messageType, []);
  }
  retryAttempts.get(messageType)!.push(attempt);
}

/**
 * Record a DLQ move for metrics
 */
export function recordDlqMove(
  messageType: string,
  errorCategory: ErrorCategory
): void {
  const key = `${messageType}:${errorCategory}`;
  const existing = dlqMoves.get(key);
  if (existing) {
    existing.count++;
  } else {
    dlqMoves.set(key, { category: errorCategory, count: 1 });
  }
}

/**
 * Get retry metrics (for admin/monitoring)
 */
export function getRetryMetrics() {
  return {
    retryAttempts: Object.fromEntries(retryAttempts),
    dlqMoves: Object.fromEntries(dlqMoves)
  };
}

/**
 * Reset retry metrics (for testing)
 */
export function resetRetryMetrics(): void {
  retryAttempts.clear();
  dlqMoves.clear();
}
