/**
 * Rate Limiter Status Operations
 * Get current rate limit status without incrementing
 */

import type { RateLimitRule } from './types';

/**
 * Get current rate limit status without incrementing
 */
export async function getStatusImplementation(
  limiter: any,
  identifier: string,
  rule: RateLimitRule
): Promise<{
  currentCount: number;
  remaining: number;
  resetAfterMs: number;
}> {
  const now = Date.now();
  const windowStart = now - rule.windowMs;
  const key = `${limiter.config.redisPrefix}:${rule.id}:${identifier}`;

  try {
    // Remove expired entries (cleanup)
    await limiter.redis.zremrangebyscore(key, 0, windowStart);

    // Count current entries
    const currentCount = await limiter.redis.zcard(key);

    const remaining = Math.max(0, rule.maxRequests - currentCount);

    // Calculate reset time if limit exceeded
    let resetAfterMs = rule.windowMs;
    if (currentCount >= rule.maxRequests) {
      const oldest = await limiter.redis.zrange(key, 0, 0, 'WITHSCORES');
      if (oldest.length > 0) {
        const oldestTime = parseInt(oldest[1], 10);
        resetAfterMs = Math.max(0, oldestTime + rule.windowMs - now);
      }
    }

    return {
      currentCount,
      remaining,
      resetAfterMs,
    };
  } catch (error: any) {
    console.error('[RateLimiter] Status error:', error);
    // Return conservative estimate on error
    return {
      currentCount: 0,
      remaining: rule.maxRequests,
      resetAfterMs: rule.windowMs,
    };
  }
}
