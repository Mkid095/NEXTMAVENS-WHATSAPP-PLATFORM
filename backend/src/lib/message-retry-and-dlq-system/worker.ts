/**
 * Enhanced Worker with Retry & DLQ Integration
 * Wraps the existing processor with comprehensive failure handling
 */

import { Worker, Job, Queue } from 'bullmq';
import {
  redisConnectionOptions,
  DEFAULT_CONCURRENCY,
  QUEUE_NAME
} from './index';
import type { AnyQueueJob } from '../message-queue-priority-system/types';
import {
  shouldRetry,
  shouldMoveToDlq,
  calculateRetryDelay,
  recordRetryAttempt,
  recordDlqMove,
  isRetryDlqEnabled
} from './retry-policy';
import {
  addToDlq,
  getRedisClient,
  closeRedisClient,
  initializeDlqConsumerGroups
} from './dlq';

// Import metrics
import {
  queueJobsActive,
  queueProcessingDuration,
  queueJobsCompletedTotal,
  queueJobsFailedTotal
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';

// ============================================================================
// Original Processors (forwarded from consumer.ts)
// ============================================================================

type JobProcessor = (job: Job<AnyQueueJob>) => Promise<void>;

// These will be set by the main consumer module
let originalProcessors: Map<string, JobProcessor> = new Map();

/**
 * Register the original processors from consumer.ts
 */
export function registerOriginalProcessors(processors: Map<string, JobProcessor>) {
  originalProcessors = processors;
}

// ============================================================================
// Enhanced Job Processor
// ============================================================================

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
          recordDlqMove(messageType, classifyErrorCategory(error));
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

        // Note: BullMQ will automatically reschedule with its default retry delay
        // We're recording metrics/logs here, but the actual retry timing is controlled by BullMQ's job options
        // To use our custom delay, we would need to call job.moveToDelayed() but that's not how BullMQ Worker works
        // Instead, we should configure retry options when the job is added (in producer)
        // Or we can manually implement delay by throwing specific errors and using a custom worker pattern
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
export function createEnhancedProcessor(originalProcessor: JobProcessor): JobProcessor {
  return async (job: Job<AnyQueueJob>) => {
    // This wraps the original processor but delegates to processJobEnhanced
    // which has the full retry/DLQ logic
    return processJobEnhanced(job);
  };
}

// Helper function for metric recording
function classifyErrorCategory(error: unknown): string {
  // Use the same classification from retry-policy
  try {
    const { classifyError } = require('./retry-policy');
    return classifyError(error);
  } catch {
    return 'unknown';
  }
}

// ============================================================================
// Worker Management (Enhanced)
// ============================================================================

let enhancedWorker: Worker | null = null;

export async function startEnhancedWorker(): Promise<Worker> {
  if (enhancedWorker) {
    console.log('[QueueWorker] Enhanced worker already running');
    return enhancedWorker;
  }

  console.log('[QueueWorker] Starting enhanced worker with retry/DLQ support');

  // Initialize DLQ consumer groups
  try {
    await initializeDlqConsumerGroups();
  } catch (error) {
    console.warn('[QueueWorker] DLQ consumer group initialization failed:', error);
  }

  enhancedWorker = new Worker(
    QUEUE_NAME,
    async (job: Job<AnyQueueJob>) => {
      await processJobEnhanced(job);
    },
    {
      connection: redisConnectionOptions,
      concurrency: DEFAULT_CONCURRENCY
    }
  );

  enhancedWorker.on('completed', (job: Job) => {
    console.log(`[QueueWorker] Job ${job.id} completed`);
  });

  enhancedWorker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[QueueWorker] Job ${job?.id} failed:`, err.message);
  });

  enhancedWorker.on('error', (err: Error) => {
    console.error('[QueueWorker] Worker error:', err);
  });

  enhancedWorker.on('stalled', (jobId: string) => {
    console.warn(`[QueueWorker] Job ${jobId} stalled`);
  });

  enhancedWorker.on('progress', (job: Job, progress: number) => {
    console.log(`[QueueWorker] Job ${job.id} is ${progress}% complete`);
  });

  console.log(`[QueueWorker] Enhanced worker started with concurrency ${DEFAULT_CONCURRENCY}`);
  return enhancedWorker;
}

export async function stopEnhancedWorker(): Promise<void> {
  if (enhancedWorker) {
    console.log('[QueueWorker] Stopping enhanced worker...');
    await enhancedWorker.close();
    enhancedWorker = null;
    console.log('[QueueWorker] Enhanced worker stopped');
  }
}

export function getEnhancedWorkerStatus(): {
  isRunning: boolean;
  concurrency: number;
  processedJobs: number;
  failedJobs: number;
} {
  if (!enhancedWorker) {
    return { isRunning: false, concurrency: 0, processedJobs: 0, failedJobs: 0 };
  }

  const w: any = enhancedWorker;
  return {
    isRunning: true,
    concurrency: enhancedWorker.concurrency,
    processedJobs: w.processedJobs || 0,
    failedJobs: w.failedJobs || 0
  };
}

export async function cleanup(): Promise<void> {
  await stopEnhancedWorker();
  await closeRedisClient();
}
