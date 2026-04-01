/**
 * Rate Limiting Configuration
 */

import type { RateLimitConfig, RateLimitRule } from './types';

/**
 * Default rate limit configuration
 * Can be overridden via environment variables or database
 */
export function getDefaultRateLimitConfig(): RateLimitConfig {
  return {
    defaultRule: {
      id: 'default-global',
      orgId: null,
      instanceId: null,
      endpoint: '*',
      maxRequests: parseInt(process.env.RATE_LIMIT_DEFAULT_MAX || '100', 10),
      windowMs: parseInt(process.env.RATE_LIMIT_DEFAULT_WINDOW_MS || '60000', 10),
      trackMetrics: true
    },
    rules: [],
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    redisPrefix: 'rate_limit',
    cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes
  };
}
