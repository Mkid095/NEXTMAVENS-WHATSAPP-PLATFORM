/**
 * Message Queue Priority System - Core
 * Sets up a BullMQ queue with priority support
 */

import { Queue } from 'bullmq';
import { MessagePriority, MessageType, getPriorityForType } from './types';

export { getPriorityForType };

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


// Create queue
export const messageQueue = new Queue(QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    removeOnComplete: { count: 1000, age: 24 * 60 * 60 * 1000 },
    removeOnFail: { count: 500, age: 7 * 24 * 60 * 60 * 1000 },
    priority: MessagePriority.MEDIUM
    // Note: retries/backoff not enabled to avoid need for QueueScheduler
  }
});

// QueueScheduler for managing delayed/retry jobs
export const queueScheduler = {
  close: async () => {}
};

// Simple add function
export async function addJob(
  type: MessageType,
  payload: Record<string, unknown>,
  options: { priority?: MessagePriority } = {}
): Promise<any> {
  const priority = options.priority ?? getPriorityForType(type);
  const jobData = {
    type,
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    source: payload.source ?? 'evolution-webhook'
  };
  return await messageQueue.add(type, jobData, { priority });
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
