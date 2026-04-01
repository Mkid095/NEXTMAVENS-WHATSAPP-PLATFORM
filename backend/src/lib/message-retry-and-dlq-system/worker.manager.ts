/**
 * Enhanced Worker Manager
 *
 * Manages the lifecycle of the BullMQ worker with retry/DLQ support.
 */

import { Worker, Job } from 'bullmq';
import {
  DEFAULT_CONCURRENCY,
  QUEUE_NAME
} from '../message-queue-priority-system';
import { redisConnectionOptions } from './dlq';
import type { AnyQueueJob } from '../message-queue-priority-system';
import { initializeDlqConsumerGroups } from './dlq';
import { closeRedisClient } from './dlq';
import { processJobEnhanced } from './enhanced.processor';

let enhancedWorker: Worker | null = null;

/**
 * Start the enhanced worker
 */
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

/**
 * Stop the enhanced worker
 */
export async function stopEnhancedWorker(): Promise<void> {
  if (enhancedWorker) {
    console.log('[QueueWorker] Stopping enhanced worker...');
    await enhancedWorker.close();
    enhancedWorker = null;
    console.log('[QueueWorker] Enhanced worker stopped');
  }
}

/**
 * Get enhanced worker status
 */
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

/**
 * Graceful cleanup
 */
export async function cleanup(): Promise<void> {
  await stopEnhancedWorker();
  await closeRedisClient();
}

/**
 * Create an enhanced processor from an original processor
 * (Alternative entry point for wrapping individual processors)
 */
export function wrapProcessor(originalProcessor: (job: Job<AnyQueueJob>) => Promise<void>): (job: Job<AnyQueueJob>) => Promise<void> {
  return async (job: Job<AnyQueueJob>) => {
    return processJobEnhanced(job);
  };
}
