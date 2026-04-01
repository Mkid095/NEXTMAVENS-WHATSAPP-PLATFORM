/**
 * Rate Limiting System with Redis
 *
 * Sliding window algorithm for API protection.
 * Re-exports all components.
 */

// Types
export * from './types';

// Configuration
export { getDefaultRateLimitConfig } from './config';

// Utilities
export {
  matchEndpoint,
  buildRateLimitKey,
  parseIdentifier
} from './utils';

// Rule matching
export { findRule } from './rule.matcher';

// Metrics service
export {
  createMetrics,
  updateMetrics,
  cloneMetrics
} from './metrics.service';

// Cleanup service
export { cleanupExpiredKeys } from './cleanup.service';

// Core limiter class
export { RedisSlidingWindowRateLimiter } from './limiter.class';

// Instance wrapper
export { RateLimiterInstance } from './instance.class';

// Factory
export { createRateLimiter } from './factory';

// Shared Redis client
export { getSharedRedisClient } from './shared-redis.client';

// Middleware
export {
  rateLimitMiddleware,
  generateIdentifier
} from './middleware';
export type { RateLimitMiddlewareOptions } from './middleware';

// Singleton management
export {
  initializeRateLimiter,
  getRateLimiter,
  shutdownRateLimiter
} from './singleton';
