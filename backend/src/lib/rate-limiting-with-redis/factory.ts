/**
 * Rate Limiter Factory
 * Creates rate limiter instances
 */

import type { RateLimitConfig, PartialRateLimitConfig } from './types';
import { getDefaultRateLimitConfig } from './config';
import { RedisSlidingWindowRateLimiter } from './limiter.class';
import { RateLimiterInstance } from './instance.class';
import { getSharedRedisClient } from './shared-redis.client';

/**
 * Creates a rate limiter instance with the given Redis client
 */
export function createRateLimiter(config: PartialRateLimitConfig = {}, redisClient?: any): RateLimiterInstance {
  const fullConfig = { ...getDefaultRateLimitConfig(), ...config };

  // Merge partial defaultRule if provided
  if (config.defaultRule) {
    fullConfig.defaultRule = { ...fullConfig.defaultRule, ...config.defaultRule };
  }

  // Use provided Redis client or get shared one
  const redis = redisClient || getSharedRedisClient();

  const limiter = new RedisSlidingWindowRateLimiter(fullConfig, redis);
  return new RateLimiterInstance(limiter, fullConfig);
}
