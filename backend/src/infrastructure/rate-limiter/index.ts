/**
 * Rate Limiting System with Redis
 * Sliding window algorithm for API protection
 *
 * Architecture:
 * - types.ts: Type definitions
 * - config.ts: Configuration helpers
 * - rate-limiter.class.ts: Core Redis sliding window implementation
 * - rate-limiter-instance.class.ts: Wrapper providing simplified interface
 * - rate-limiter-factory.ts: Factory for creating instances with shared Redis
 * - middleware.ts: Fastify middleware integration
 * - singleton.ts: Global singleton management
 *
 * All implementation files are kept under 150 lines each.
 */

// Re-export types
export * from './types';

// Re-export configuration
export { getDefaultRateLimitConfig } from './config';

// Re-export core classes
export { RedisSlidingWindowRateLimiter } from './rate-limiter.class';
export { RateLimiterInstance } from './rate-limiter-instance.class';

// Re-export factory
export { createRateLimiter } from './rate-limiter-factory';

// Re-export middleware (values)
export { rateLimitMiddleware, generateIdentifier } from './middleware';

// Re-export middleware types
export type { RateLimitMiddlewareOptions } from './middleware';

// Re-export singleton management
export { initializeRateLimiter, getRateLimiter, shutdownRateLimiter } from './singleton';
