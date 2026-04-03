import { Job } from 'bullmq';
import type { AnyQueueJob } from '../../lib/message-queue-priority-system/types';
import { shouldRetry, shouldMoveToDlq } from './retry-evaluator';
import { calculateRetryDelay } from './retry-delay.calculator';
import { recordRetryAttempt, recordDlqMove } from './retry-metrics';
import { isRetryDlqEnabled } from './error-classification.types';
import { ErrorCategory } from './error-classification.types';
import { addToDlq } from './write.operations';
import {
  queueJobsActive,
  queueProcessingDuration,
  queueJobsCompletedTotal,
  queueJobsFailedTotal
} from '../../lib/create-comprehensive-metrics-dashboard-(grafana)/index';

// Original processors (set by registration)
let originalProcessors: Map<string, (job: Job<AnyQueueJob>) => Promise<void>> = new Map();

/**
 * Register the original processors
 */
export function registerOriginalProcessors(processors: Map<string, (job: Job<AnyQueueJob>) => Promise<void>>) {
  originalProcessors = processors;
}

/**
 * Enhanced processJob with retry and DLQ logic
 */
export async function processJobEnhanced(job: Job<AnyQueueJob>): Promise<void> {
  const startTime = Date.now();
  queueJobsActive.inc();

  console.log(`[QueueWorker] Processing job ${job.id} (name: ${job.name}, priority: ${job.opts?.priority}, attempts: ${job.attemptsMade})`);

  try {
    const processor = originalProcessors.get(job.name as string);

    if (!processor) {
      throw new Error(`Unsupported job type: ${job.name}`);
    }

    await processor(job);

    // Success
    const duration = (Date.now() - startTime) / 1000;
    queueProcessingDuration.observe({ message_type: job.name as string }, duration);
    queueJobsCompletedTotal.inc({ message_type: job.name as string });

    console.log(`[QueueWorker] Job ${job.id} completed successfully (${duration.toFixed(2)}s)`);
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const attempts = job.attemptsMade + 1;

    queueProcessingDuration.observe({ message_type: job.name as string }, duration);

    if (isRetryDlqEnabled()) {
      const messageType = job.name as string;
      const shouldRetryJob = shouldRetry(job, attempts, error);
      const moveToDlq = shouldMoveToDlq(job, attempts, error);

      if (moveToDlq) {
        console.error(`[QueueWorker] Job ${job.id} failed permanently after ${attempts} attempts:`, error);

        try {
          await addToDlq(job as any, error, attempts);
          queueJobsFailedTotal.inc({ failure_type: 'dlq' });
          recordDlqMove(messageType, classifyErrorCategory(error));
          console.log(`[QueueWorker] Job ${job.id} moved to DLQ`);
        } catch (dlqError) {
          console.error(`[QueueWorker] Failed to move job ${job.id} to DLQ:`, dlqError);
        }
      } else if (shouldRetryJob) {
        const retryResult = calculateRetryDelay(job as any, attempts, error);
        console.log(`[QueueWorker] Job ${job.id} will be retried in ${retryResult.delayMs}ms (attempt ${attempts}/${retryResult.maxAttempts})`);
        recordRetryAttempt(messageType, attempts, retryResult.delayMs);
      } else {
        console.warn(`[QueueWorker] Job ${job.id} failed but not retrying (unhandled state)`);
      }
    } else {
      console.error(`[QueueWorker] Job ${job.id} failed (retry/DLQ disabled):`, error);
    }

    queueJobsFailedTotal.inc({ failure_type: (error as Error).name || 'unknown' });
    throw error;
  } finally {
    queueJobsActive.dec();
  }
}

/**
 * Create enhanced processor wrapper
 */
export function createEnhancedProcessor(originalProcessor: (job: Job<AnyQueueJob>) => Promise<void>): (job: Job<AnyQueueJob>) => Promise<void> {
  return async (job: Job<AnyQueueJob>) => {
    return processJobEnhanced(job);
  };
}

function classifyErrorCategory(error: unknown): ErrorCategory {
  try {
    const { classifyError } = require('./retry-policy');
    return classifyError(error);
  } catch {
    return ErrorCategory.UNKNOWN;
  }
}
