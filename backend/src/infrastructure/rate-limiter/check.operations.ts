/**
 * Rate Limiter Check Operations
 * Core rate limiting logic using Redis sorted sets
 */

import type { RateLimitRule, RateLimitResult } from './types';

/**
 * Check if a request is allowed and update counters
 */
export async function checkImplementation(
  limiter: any,
  identifier: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - rule.windowMs;
  const key = `${limiter.config.redisPrefix}:${rule.id}:${identifier}`;

  try {
    // Remove expired entries (older than window)
    await limiter.redis.zremrangebyscore(key, 0, windowStart);

    // Count current entries in window
    const currentCount = await limiter.redis.zcard(key);

    if (currentCount >= rule.maxRequests) {
      // Rate limit exceeded
      const oldest = await limiter.redis.zrange(key, 0, 0, 'WITHSCORES');
      let resetAfterMs = rule.windowMs;
      if (oldest.length > 0) {
        const oldestTime = parseInt(oldest[1], 10);
        resetAfterMs = oldestTime + rule.windowMs - now;
      }

      return {
        allowed: false,
        remaining: 0,
        resetAfterMs: Math.max(0, resetAfterMs),
        currentCount,
        rule,
      };
    }

    // Allow request: add current timestamp
    await limiter.redis.zadd(key, now, now.toString());
    await limiter.redis.expire(key, Math.ceil(rule.windowMs / 1000));

    const remaining = rule.maxRequests - (currentCount + 1);

    return {
      allowed: true,
      remaining: Math.max(0, remaining),
      resetAfterMs: rule.windowMs,
      currentCount: currentCount + 1,
      rule,
    };
  } catch (error: any) {
    // On Redis error, fail open (allow request) but log
    console.error('[RateLimiter] Check error:', error);
    return {
      allowed: true, // fail open
      remaining: rule.maxRequests,
      resetAfterMs: rule.windowMs,
      currentCount: 0,
      rule,
    };
  }
}
