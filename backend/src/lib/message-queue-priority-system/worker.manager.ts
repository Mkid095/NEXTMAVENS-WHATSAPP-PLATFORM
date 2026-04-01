/**
 * Message Queue Worker - Manager
 * Lifecycle management for the BullMQ worker
 */

import { Worker, Job } from 'bullmq';
import { redisConnectionOptions, QUEUE_NAME, DEFAULT_CONCURRENCY } from './config';
import { processJob } from './worker.processor';

let worker: Worker | null = null;

/**
 * Start the BullMQ worker
 * Creates worker if not already running and begins consuming jobs
 */
export function startWorker(): Worker {
  if (worker) {
    console.log('[QueueWorker] Worker already running');
    return worker;
  }

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      await processJob(job);
    },
    {
      connection: redisConnectionOptions,
      concurrency: DEFAULT_CONCURRENCY
    }
  );

  worker.on('completed', (job: Job) => {
    console.log(`[QueueWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[QueueWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err: Error) => {
    console.error('[QueueWorker] Worker error:', err);
  });

  worker.on('stalled', (jobId: string) => {
    console.warn(`[QueueWorker] Job ${jobId} stalled`);
  });

  worker.on('progress', (job: Job, progress: number) => {
    console.log(`[QueueWorker] Job ${job.id} is ${progress}% complete`);
  });

  console.log(`[QueueWorker] Started with concurrency ${DEFAULT_CONCURRENCY}`);
  return worker;
}

/**
 * Stop the BullMQ worker gracefully
 * Closes worker and cleans up connections
 */
export async function stopWorker(): Promise<void> {
  if (worker) {
    console.log('[QueueWorker] Stopping worker...');
    await worker.close();
    worker = null;
    console.log('[QueueWorker] Worker stopped');
  }
}

/**
 * Get current worker status
 * Returns runtime statistics about the worker
 */
export function getWorkerStatus(): {
  isRunning: boolean;
  concurrency: number;
  processedJobs: number;
  failedJobs: number;
} {
  if (!worker) {
    return { isRunning: false, concurrency: 0, processedJobs: 0, failedJobs: 0 };
  }

  // Use type assertion to access BullMQ's extended properties
  const w: any = worker;
  return {
    isRunning: true,
    concurrency: worker.concurrency,
    processedJobs: w.processedJobs || 0,
    failedJobs: w.failedJobs || 0
  };
}
