/**
 * Enhanced Job Processor with Retry & DLQ
 *
 * Wraps original processors with comprehensive failure handling.
 */

import { Job } from 'bullmq';
import type { AnyQueueJob } from '../message-queue-priority-system';
import {
  shouldRetry,
  shouldMoveToDlq,
  calculateRetryDelay,
  recordRetryAttempt,
  recordDlqMove,
  isRetryDlqEnabled
} from './retry-policy';
import { classifyError } from './types';
import { addToDlq } from './dlq';

// Import metrics
import {
  queueJobsActive,
  queueProcessingDuration,
  queueJobsCompletedTotal,
  queueJobsFailedTotal
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';

// Original processors (set by registration)
let originalProcessors: Map<string, (job: Job<AnyQueueJob>) => Promise<void>> = new Map();

/**
 * Register the original processors from consumer.ts
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
    // Get the appropriate processor
    const processor = originalProcessors.get(job.name as string);

    if (!processor) {
      throw new Error(`Unsupported job type: ${job.name}`);
    }

    // Execute the original processor
    await processor(job);

    // Success
    const duration = (Date.now() - startTime) / 1000;
    queueProcessingDuration.observe({ message_type: job.name as string }, duration);
    queueJobsCompletedTotal.inc({ message_type: job.name as string });

    console.log(`[QueueWorker] Job ${job.id} completed successfully (${duration.toFixed(2)}s)`);
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const attempts = job.attemptsMade + 1; // attemptsMade is the number of previous attempts

    queueProcessingDuration.observe({ message_type: job.name as string }, duration);

    // Enhanced error handling with retry/DLQ
    if (isRetryDlqEnabled()) {
      const messageType = job.name as string;
      const shouldRetryJob = shouldRetry(job, attempts, error);
      const moveToDlq = shouldMoveToDlq(job, attempts, error);

      if (moveToDlq) {
        // Job exceeded retry limit or is a permanent error - move to DLQ
        console.error(`[QueueWorker] Job ${job.id} failed permanently after ${attempts} attempts:`, error);

        try {
          await addToDlq(job as any, error, attempts);
          queueJobsFailedTotal.inc({ failure_type: 'dlq' });
          recordDlqMove(messageType, classifyError(error));
          console.log(`[QueueWorker] Job ${job.id} moved to DLQ`);
        } catch (dlqError) {
          console.error(`[QueueWorker] Failed to move job ${job.id} to DLQ:`, dlqError);
          // Still throw the original error so BullMQ tracks it as failed
        }
      } else if (shouldRetryJob) {
        // Job should be retried - calculate delay
        const retryResult = calculateRetryDelay(job as any, attempts, error);
        console.log(`[QueueWorker] Job ${job.id} will be retried in ${retryResult.delayMs}ms (attempt ${attempts}/${retryResult.maxAttempts})`);

        recordRetryAttempt(messageType, attempts, retryResult.delayMs);

        // Note: BullMQ handles retry timing based on job options; we just record metrics/logs
      } else {
        console.warn(`[QueueWorker] Job ${job.id} failed but not retrying (unhandled state)`);
      }
    } else {
      // Legacy behavior - just log and let BullMQ handle with default retry
      console.error(`[QueueWorker] Job ${job.id} failed (retry/DLQ disabled):`, error);
    }

    // Record failure metric (always)
    queueJobsFailedTotal.inc({ failure_type: (error as Error).name || 'unknown' });

    // Always throw so BullMQ tracks the failure
    throw error;
  } finally {
    queueJobsActive.dec();
  }
}

/**
 * Wrapper function to create enhanced processor from original
 */
export function createEnhancedProcessor(originalProcessor: (job: Job<AnyQueueJob>) => Promise<void>): (job: Job<AnyQueueJob>) => Promise<void> {
  return async (job: Job<AnyQueueJob>) => {
    // This wraps the original processor but delegates to processJobEnhanced
    // which has the full retry/DLQ logic
    return processJobEnhanced(job);
  };
}
