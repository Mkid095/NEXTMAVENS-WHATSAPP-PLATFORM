/**
 * Rate Limiting Singleton Management
 */

import type { PartialRateLimitConfig } from './types';
import { createRateLimiter } from './factory';

let rateLimiterInstance: any = null;

/**
 * Initialize the global rate limiter singleton
 */
export async function initializeRateLimiter(config?: PartialRateLimitConfig): Promise<any> {
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
export function getRateLimiter(): any {
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
