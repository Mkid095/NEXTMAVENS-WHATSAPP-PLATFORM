/**
 * Rate Limiter Singleton Management
 */

import type { RateLimitConfig } from './types';
import { createRateLimiter } from './rate-limiter-factory';
import { RateLimiterInstance } from './rate-limiter-instance.class';

let rateLimiterInstance: RateLimiterInstance | null = null;

/**
 * Initialize the global rate limiter singleton
 */
export async function initializeRateLimiter(config?: Partial<RateLimitConfig>): Promise<RateLimiterInstance> {
  if (rateLimiterInstance) {
    return rateLimiterInstance;
  }

  rateLimiterInstance = createRateLimiter(config);
  rateLimiterInstance.start();

  console.log('[RateLimiter] Initialized', {
    enabled: rateLimiterInstance.config.enabled,
    defaultRule: rateLimiterInstance.config.defaultRule,
    rulesCount: rateLimiterInstance.config.rules.length
  });

  return rateLimiterInstance;
}

/**
 * Get the global rate limiter instance
 */
export function getRateLimiter(): RateLimiterInstance | null {
  return rateLimiterInstance;
}

/**
 * Shutdown rate limiter
 */
export async function shutdownRateLimiter(): Promise<void> {
  if (rateLimiterInstance) {
    rateLimiterInstance.stop();
    rateLimiterInstance = null;
    console.log('[RateLimiter] Shutdown complete');
  }
}
