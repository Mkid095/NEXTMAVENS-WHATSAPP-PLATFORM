import type { Job } from 'bullmq';
import { ErrorCategory, classifyError } from './error-classification.types';
import type { RetryPolicy } from './retry-policy.types';
import { getRetryPolicy } from './retry-policy.queries';

/**
 * Determine if a job should be retried
 */
export function shouldRetry(
  job: Job,
  attempt: number,
  error: unknown
): boolean {
  const messageType = job.name as string || 'MESSAGE_UPSERT';
  const policy = getRetryPolicy(messageType);

  // Check if we've exceeded max retries
  if (attempt > policy.maxRetries) {
    return false;
  }

  // Classify the error
  const category = classifyError(error);

  // Permanent errors should not be retried
  if (category === ErrorCategory.PERMANENT) {
    return false;
  }

  // Transient or unknown errors should be retried (if under max retries)
  return true;
}

/**
 * Determine if a job should be moved to DLQ
 */
export function shouldMoveToDlq(
  job: Job,
  attempt: number,
  error: unknown
): boolean {
  const messageType = job.name as string || 'MESSAGE_UPSERT';
  const policy = getRetryPolicy(messageType);

  // Check if we've exceeded max retries
  if (attempt > policy.maxRetries) {
    return true;
  }

  // Permanent errors go straight to DLQ regardless of attempt count
  const category = classifyError(error);
  if (category === ErrorCategory.PERMANENT) {
    return true;
  }

  return false;
}
