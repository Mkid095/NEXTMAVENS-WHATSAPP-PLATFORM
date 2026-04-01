/**
 * Message Queue Priority System - Queue Instance
 * Creates and exports the BullMQ queue with priority support
 */

import { Queue } from 'bullmq';
import { MessagePriority } from './enums';
import {
  redisConnectionOptions,
  QUEUE_NAME,
  DEFAULT_CONCURRENCY,
  ENABLE_RETRY_DLQ,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY,
} from './config';

// Create queue
export const messageQueue = new Queue(QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    removeOnComplete: { count: 1000, age: 24 * 60 * 60 * 1000 },
    removeOnFail: { count: 500, age: 7 * 24 * 60 * 60 * 1000 },
    priority: MessagePriority.MEDIUM,
    ...(ENABLE_RETRY_DLQ && {
      // Enable retries with exponential backoff only if feature flag is on
      attempts: DEFAULT_MAX_RETRIES,
      backoff: {
        type: 'exponential',
        delay: DEFAULT_RETRY_DELAY
      }
    })
    // Note: DLQ handled separately via custom logic in processJob
  }
});

// Note: In BullMQ v5, QueueScheduler is no longer needed.
// Delayed and retry jobs are automatically handled by the Worker.
// The Worker will process delayed jobs without requiring a separate scheduler.
