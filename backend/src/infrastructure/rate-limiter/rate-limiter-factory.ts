/**
 * Rate Limiter Factory
 * Creates rate limiter instances with shared Redis connection
 */

import type { RateLimitConfig } from './types';
import { getDefaultRateLimitConfig } from './config';
import { RedisSlidingWindowRateLimiter } from './rate-limiter.class';
import { RateLimiterInstance } from './rate-limiter-instance.class';

let sharedRedisClient: any = null;

/**
 * Get or create shared Redis client
 */
function getSharedRedisClient(): any {
  if (sharedRedisClient) {
    return sharedRedisClient;
  }

  // Import Redis configuration from message queue system
  try {
    const queueModule = require('../message-queue-priority-system');
    const redisOptions = queueModule.redisConnectionOptions || queueModule.default?.redisConnectionOptions;

    if (redisOptions) {
      const Redis = require('ioredis');
      sharedRedisClient = new Redis(redisOptions);
      console.log('[RateLimiter] Using shared Redis connection from message queue system');
      return sharedRedisClient;
    }
  } catch (error) {
    console.warn('[RateLimiter] Could not import Redis config from queue system, creating standalone client:', error.message);
  }

  // Fallback: create standalone Redis client from env
  const Redis = require('ioredis');
  sharedRedisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });

  return sharedRedisClient;
}

/**
 * Creates a rate limiter instance with the given Redis client
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}, redisClient?: any): RateLimiterInstance {
  const fullConfig = { ...getDefaultRateLimitConfig(), ...config };

  // Use provided Redis client or import from queue system
  const redis = redisClient || getSharedRedisClient();

  const limiter = new RedisSlidingWindowRateLimiter(fullConfig, redis);
  return new RateLimiterInstance(limiter, fullConfig);
}
