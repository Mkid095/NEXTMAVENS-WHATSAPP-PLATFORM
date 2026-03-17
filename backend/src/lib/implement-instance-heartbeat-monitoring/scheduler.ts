import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { syncInstanceStatuses } from './storage';

// Import metrics
import {
  instanceCurrentlyOnline,
  instanceBackgroundSyncDuration
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';

let heartbeatQueue: Queue | null = null;
let worker: Worker | null = null;

function getRedisConnection(): Redis {
  // Reuse Redis from message queue system if available
  try {
    const queueModule = require('../message-queue-priority-system');
    const redisOptions = queueModule.redisConnectionOptions || queueModule.default?.redisConnectionOptions;
    if (redisOptions) {
      return new Redis(redisOptions);
    }
  } catch {
    // ignore
  }

  const port = parseInt(process.env.REDIS_PORT || '6381', 10);
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

/**
 * Start the heartbeat status synchronization job.
 * Runs every 30 seconds to update PostgreSQL status based on Redis heartbeats.
 */
export function startHeartbeatScheduler(): void {
  if (heartbeatQueue) {
    return; // already started
  }

  const connection = getRedisConnection();

  heartbeatQueue = new Queue('heartbeat-sync', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        count: 10,
        age: 24 * 60 * 60 * 1000, // 1 day
      },
      removeOnFail: {
        count: 5,
        age: 24 * 60 * 60 * 1000,
      },
    },
  });

  // Add repeating job: every 30 seconds (using millisecond interval to avoid cron parsing issues)
  heartbeatQueue.add(
    'sync-status',
    {},
    {
      repeat: { every: 30000 } // 30 seconds in milliseconds
    }
  );

  // Worker to process the sync job
  worker = new Worker(
    'heartbeat-sync',
    async (job: Job) => {
      if (job.name === 'sync-status') {
        await syncInstanceStatuses();
      }
    },
    { connection }
  );

  worker.on('completed', (job: Job) => {
    console.log(`[Heartbeat] Job ${job.id} completed`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[Heartbeat] Job ${job?.id} failed:`, err.message);
  });

  console.log('[Heartbeat] Scheduler started (sync every 30 seconds)');
}

/**
 * Stop the heartbeat scheduler.
 */
export async function stopHeartbeatScheduler(): Promise<void> {
  console.log('[Heartbeat] stopHeartbeatScheduler() called, worker:', !!worker, 'queue:', !!heartbeatQueue);
  try {
    if (worker) {
      console.log('[Heartbeat] Closing worker...');
      await worker.close();
      worker = null;
      console.log('[Heartbeat] Worker closed successfully');
    } else {
      console.log('[Heartbeat] No worker to close');
    }
  } catch (err) {
    console.warn('[Heartbeat] Worker close error:', err);
  }
  try {
    if (heartbeatQueue) {
      console.log('[Heartbeat] Closing queue...');
      await heartbeatQueue.close();
      heartbeatQueue = null;
      console.log('[Heartbeat] Queue closed successfully');
    } else {
      console.log('[Heartbeat] No queue to close');
    }
  } catch (err) {
    console.warn('[Heartbeat] Queue close error:', err);
  }
}

/**
 * Manually trigger a sync (useful for admin trigger or testing).
 */
export async function triggerSync(): Promise<void> {
  await syncInstanceStatuses();
}
