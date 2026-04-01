import { Redis } from 'ioredis';

let sharedRedis: Redis | null = null;

export function setRedisClient(client: Redis): void {
  sharedRedis = client;
}

/**
 * Shutdown the Redis client if it was created by this module.
 * Safe to call multiple times.
 */
export async function shutdownRedisClient(): Promise<void> {
  console.log('[HeartbeatStorage] shutdownRedisClient() called, sharedRedis exists:', !!sharedRedis);
  if (sharedRedis) {
    try {
      console.log('[HeartbeatStorage] Calling sharedRedis.quit()...');
      await sharedRedis.quit();
      console.log('[HeartbeatStorage] Redis quit successful');
    } catch (e) {
      console.warn('[HeartbeatStorage] Error closing Redis client:', e);
    }
    sharedRedis = null;
  } else {
    console.log('[HeartbeatStorage] No shared Redis client to close');
  }
}

function getRedisClient(): Redis {
  console.log('[HeartbeatStorage] getRedisClient() called, sharedRedis exists:', !!sharedRedis);
  if (sharedRedis) {
    console.log('[HeartbeatStorage] Returning existing sharedRedis connection');
    return sharedRedis;
  }

  // Try to get from queue system (similar to rate limiter)
  try {
    console.log('[HeartbeatStorage] Attempting to reuse queue system Redis connection...');
    const queueModule = require('../message-queue-priority-system');
    const redisOptions = queueModule.redisConnectionOptions || queueModule.default?.redisConnectionOptions;
    if (redisOptions) {
      console.log('[HeartbeatStorage] Found queue system Redis options, creating new connection with reused config');
      sharedRedis = new Redis(redisOptions);
      return sharedRedis;
    }
    console.log('[HeartbeatStorage] Queue system Redis options not found');
  } catch (e) {
    console.log('[HeartbeatStorage] Failed to get queue system Redis:', e);
    // ignore, fallback below
  }

  // Fallback: create from env
  console.log('[HeartbeatStorage] Creating Redis connection from environment variables');
  const port = parseInt(process.env.REDIS_PORT || '6381', 10);
  sharedRedis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return sharedRedis;
}

export { getRedisClient };

const HEARTBEAT_KEY_PREFIX = 'heartbeat:';
const METRICS_KEY_PREFIX = 'heartbeat:metrics:';

export { HEARTBEAT_KEY_PREFIX, METRICS_KEY_PREFIX };
