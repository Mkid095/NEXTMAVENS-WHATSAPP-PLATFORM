import { Worker, type Job } from 'bullmq';
import type { AnyQueueJob } from '../../lib/message-queue-priority-system/types';
import { redisConnectionOptions } from './dlq.config';
import { initializeDlqConsumerGroups } from './admin.operations';
import { closeRedisClient } from './dlq.redis.client';
import { QUEUE_NAME, DEFAULT_CONCURRENCY } from '../../lib/message-queue-priority-system';
import { processJobEnhanced } from './worker.processor';

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
 * Cleanup all resources
 */
export async function cleanup(): Promise<void> {
  await stopEnhancedWorker();
  await closeRedisClient();
}
