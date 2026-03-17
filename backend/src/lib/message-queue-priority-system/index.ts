/**
 * Message Queue Priority System - Core
 * Sets up a BullMQ queue with priority support
 */

import { Queue } from 'bullmq';
import { MessagePriority, MessageType, getPriorityForType } from './types';

// QueueScheduler may not have types in some BullMQ versions; use any
const QueueScheduler: any = require('bullmq').QueueScheduler || require('bullmq').default.QueueScheduler;

// Import retry policies (lazy to avoid circular deps)
let retryPolicies: any = null;
async function loadRetryPolicies() {
  if (!retryPolicies) {
    const policies = await import('../message-retry-and-dlq-system/retry-policy');
    retryPolicies = policies.DEFAULT_RETRY_POLICIES;
  }
  return retryPolicies;
}

// Import metrics (Phase 2 Step 8)
import {
  queueJobsTotal,
  queueJobsActive,
  queueJobsCompletedTotal,
  queueJobsFailedTotal,
  queueProcessingDuration
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';

export { getPriorityForType, MessageType };

// Redis configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

export const redisConnectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

export const QUEUE_NAME = 'whatsapp-messages';
export const DEFAULT_CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '10', 10);


// Retry configuration (Phase 3 Step 1)
// Note: These are defaults; actual retry attempts per job type will be managed via job options
const ENABLE_RETRY_DLQ = process.env.ENABLE_RETRY_DLQ === 'true';
const DEFAULT_MAX_RETRIES = parseInt(process.env.MESSAGE_RETRY_MAX_ATTEMPTS || '5', 10);
const DEFAULT_RETRY_DELAY = parseInt(process.env.MESSAGE_RETRY_BASE_DELAY_MS || '1000', 10);
const MAX_RETRY_DELAY = parseInt(process.env.MESSAGE_RETRY_MAX_DELAY_MS || '300000', 10); // 5 minutes

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

// QueueScheduler for managing delayed/retry jobs (required for backoff)
export const queueScheduler = new QueueScheduler(QUEUE_NAME, {
  connection: redisConnectionOptions,
  // Run every 5 seconds to check for delayed jobs
  interval: 5000,
  // Optional: limit the number of delayed jobs to fetch per worker
  limiter: { max: 1000 }
});

// Handle queue scheduler errors
queueScheduler.on('error', (err: Error) => {
  console.error('[QueueScheduler] Error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[QueueScheduler] Shutting down...');
  await queueScheduler.close();
});

process.on('SIGINT', async () => {
  console.log('[QueueScheduler] Shutting down...');
  await queueScheduler.close();
});

// ============================================================================
// Retry Policy Helpers (Phase 3 Step 1)
// ============================================================================

/**
 * Get retry limit for a specific message type
 */
async function getRetryLimitForType(type: MessageType): Promise<number> {
  const policies = await loadRetryPolicies();
  return policies[type]?.maxRetries ?? DEFAULT_MAX_RETRIES;
}

/**
 * Get base retry delay for a specific message type (in ms)
 */
async function getRetryBaseDelayForType(type: MessageType): Promise<number> {
  const policies = await loadRetryPolicies();
  return policies[type]?.baseDelayMs ?? DEFAULT_RETRY_DELAY;
}

// Simple add function
export async function addJob(
  type: MessageType,
  payload: Record<string, unknown>,
  options: {
    priority?: MessagePriority;
    deduplication?: {
      /** Custom deduplication ID (if not provided, will be auto-generated from payload) */
      id?: string;
      /** Deduplication TTL in ms (overrides default) */
      ttl?: number;
      /** Enable/disable deduplication explicitly */
      enabled?: boolean;
      /** Extend TTL on duplicate */
      extend?: boolean;
      /** Replace pending job data on duplicate */
      replace?: boolean;
      /** Required delay for debounce mode */
      delay?: number;
    };
    /** Override retry attempts for this specific job */
    retries?: number;
    /** Override retry delay for this specific job */
    backoffDelay?: number;
  } = {}
): Promise<any> {
  const priority = options.priority ?? getPriorityForType(type);

  // Record metric: job added
  const priorityLabel = Object.keys(MessagePriority).find(key => (MessagePriority as any)[key] === priority) || 'MEDIUM';
  queueJobsTotal.inc({ message_type: type, priority: priorityLabel.toLowerCase() });

  // Build BullMQ job options
  const bullmqOptions: any = { priority };

  // Apply retry configuration if enabled
  if (ENABLE_RETRY_DLQ) {
    // Use provided overrides, or get from default retry policies based on message type
    const retries = options.retries ?? await getRetryLimitForType(type);
    const backoffDelay = options.backoffDelay ?? await getRetryBaseDelayForType(type);

    bullmqOptions.attempts = retries;
    bullmqOptions.backoff = {
      type: 'exponential',
      delay: backoffDelay
    };
  }

  // Integrate deduplication if requested
  if (options.deduplication) {
    const dedupConfig = options.deduplication;

    // If ID not provided, generate from payload (requires the deduplication lib)
    let deduplicationId = dedupConfig.id;
    if (!deduplicationId) {
      // Dynamic import to avoid circular dependency with deduplication system
      try {
        const dedupLib = await import('../implement-message-deduplication-system');
        deduplicationId = dedupLib.generateDeduplicationId(type, payload);
      } catch (e) {
        // If deduplication lib not available, skip deduplication
        console.warn('[MessageQueue] Deduplication library not available:', e.message);
      }
    }

    if (deduplicationId) {
      bullmqOptions.deduplication = {
        id: deduplicationId,
        ttl: dedupConfig.ttl ?? 60 * 60 * 1000 // Default 1 hour
      };
      if (dedupConfig.extend) bullmqOptions.extend = true;
      if (dedupConfig.replace) bullmqOptions.replace = true;
      if (dedupConfig.delay) bullmqOptions.delay = dedupConfig.delay;
    }
  }

  const jobData = {
    type,
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    source: payload.source ?? 'evolution-webhook'
  };
  return await messageQueue.add(type, jobData, bullmqOptions);
}

export async function addCriticalJob(type: MessageType, payload: Record<string, unknown>): Promise<any> {
  return await addJob(type, payload, { priority: MessagePriority.CRITICAL });
}

export async function addBackgroundJob(type: MessageType, payload: Record<string, unknown>): Promise<any> {
  return await addJob(type, payload, { priority: MessagePriority.BACKGROUND });
}

export async function getQueueMetrics(): Promise<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  priorityRanges: Record<string, number>;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    messageQueue.getWaitingCount(),
    messageQueue.getActiveCount(),
    messageQueue.getCompletedCount(),
    messageQueue.getFailedCount(),
    messageQueue.getDelayedCount()
  ]);

  const jobs = await messageQueue.getJobs();
  const priorityRanges: Record<string, number> = {};
  for (const job of jobs) {
    const p = (job.opts.priority ?? 10).toString();
    priorityRanges[p] = (priorityRanges[p] ?? 0) + 1;
  }

  return { name: QUEUE_NAME, waiting, active, completed, failed, delayed, priorityRanges };
}

export async function cleanOldJobs(ageHours: number = 24, batchSize: number = 1000): Promise<number> {
  // Clean completed and failed jobs. Return count of total deleted (not critical for now)
  await messageQueue.clean(ageHours * 60 * 60 * 1000, batchSize, 'completed');
  await messageQueue.clean(ageHours * 60 * 60 * 1000, batchSize, 'failed');
  return 0; // Placeholder - can be enhanced if needed
}

export async function pauseQueue(): Promise<void> {
  await messageQueue.pause();
}

export async function resumeQueue(): Promise<void> {
  await messageQueue.resume();
}

export async function shutdownQueue(): Promise<void> {
  await messageQueue.close();
}

// Simple health check
let healthRedis: any = null;
export async function validateRedisConnection(): Promise<boolean> {
  try {
    if (!healthRedis) {
      const Redis = require('ioredis');
      healthRedis = new Redis(redisConnectionOptions);
    }
    const pong = await healthRedis.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('Redis connection failed:', error);
    return false;
  }
}

// Re-export worker management functions
export { startWorker, stopWorker, getWorkerStatus } from './consumer';
