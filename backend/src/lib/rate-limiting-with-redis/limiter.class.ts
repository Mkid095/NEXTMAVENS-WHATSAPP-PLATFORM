/**
 * Redis Sliding Window Rate Limiter
 * Core implementation using sorted sets for efficient rate limiting.
 *
 * This class is the heart of the rate limiting system. It uses Redis sorted sets
 * to track request timestamps and enforce limits with O(log(N)) operations.
 */

import type { RateLimitConfig, RateLimitRule, RateLimitResult, RateLimitMetrics } from './types';
import { getDefaultRateLimitConfig } from './config';
import { findRule } from './rule.matcher';
import { updateMetrics, createMetrics, cloneMetrics } from './metrics.service';
import { cleanupExpiredKeys } from './cleanup.service';

/**
 * Redis Sliding Window Rate Limiter
 *
 * Implements a sliding window rate limit algorithm using Redis sorted sets.
 * Each request is tracked with its timestamp as the score in a sorted set.
 * The window is defined by the rule's windowMs.
 */
export class RedisSlidingWindowRateLimiter {
  private config: RateLimitConfig;
  private redis: any; // Redis client
  private metrics: RateLimitMetrics;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: Partial<RateLimitConfig> = {}, redisClient?: any) {
    const defaultConfig = getDefaultRateLimitConfig();
    this.config = {
      ...defaultConfig,
      ...config,
      defaultRule: { ...defaultConfig.defaultRule, ...config.defaultRule },
      rules: config.rules || defaultConfig.rules,
    };
    this.redis = redisClient; // Will be set by factory if not provided
    this.metrics = createMetrics();
  }

  /**
   * Set the Redis client (useful for dependency injection)
   */
  setRedisClient(redis: any): void {
    this.redis = redis;
  }

  /**
   * Start periodic cleanup of expired rate limit keys
   */
  startBackgroundCleanup(): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(console.error);
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Stop background cleanup
   */
  stopBackgroundCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Internal cleanup task
   */
  private async cleanup(): Promise<number> {
    if (!this.redis) return 0;
    const cleaned = await cleanupExpiredKeys(this.redis, this.config.redisPrefix);
    if (cleaned > 0) {
      console.log(`[RateLimiter] Cleaned up ${cleaned} orphaned keys`);
    }
    return cleaned;
  }

  /**
   * Find the applicable rate limit rule for a request
   */
  findRule(endpoint: string, orgId?: string, instanceId?: string): RateLimitRule {
    return findRule(this.config.rules, endpoint, orgId, instanceId) || this.config.defaultRule;
  }

  /**
   * Check if a request is allowed and optionally update metrics
   */
  async check(identifier: string, rule: RateLimitRule, updateMetricsFlag: boolean = true): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const key = `${this.config.redisPrefix}:${rule.id}:${identifier}`;

    try {
      // Ensure redis client is available
      if (!this.redis) {
        throw new Error('Redis client not initialized');
      }

      // Remove expired entries (older than window)
      await this.redis.zremrangebyscore(key, 0, windowStart);

      // Count current entries in window
      const currentCount = await this.redis.zcard(key);

      if (currentCount >= rule.maxRequests) {
        // Rate limit exceeded
        const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        let resetAfterMs = rule.windowMs;
        if (oldest.length > 0) {
          const oldestTime = parseInt(oldest[1], 10);
          resetAfterMs = Math.max(0, oldestTime + rule.windowMs - now);
        }

        const result: RateLimitResult = {
          allowed: false,
          remaining: 0,
          resetAfterMs,
          currentCount,
          rule,
        };

        if (updateMetricsFlag && rule.trackMetrics) {
          updateMetrics(this.metrics, rule, identifier, false);
        }

        return result;
      }

      // Allow request: add current timestamp
      await this.redis.zadd(key, now, now.toString());
      await this.redis.expire(key, Math.ceil(rule.windowMs / 1000));

      const remaining = rule.maxRequests - (currentCount + 1);

      const result: RateLimitResult = {
        allowed: true,
        remaining: Math.max(0, remaining),
        resetAfterMs: rule.windowMs,
        currentCount: currentCount + 1,
        rule,
      };

      if (updateMetricsFlag && rule.trackMetrics) {
        updateMetrics(this.metrics, rule, identifier, true);
      }

      return result;
    } catch (error: any) {
      console.error('[RateLimiter] Check error:', error);
      // Fail open: allow request on error
      return {
        allowed: true,
        remaining: rule.maxRequests,
        resetAfterMs: rule.windowMs,
        currentCount: 0,
        rule,
      };
    }
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getStatus(identifier: string, rule: RateLimitRule): Promise<{
    currentCount: number;
    remaining: number;
    resetAfterMs: number;
  }> {
    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const key = `${this.config.redisPrefix}:${rule.id}:${identifier}`;

    try {
      if (!this.redis) {
        throw new Error('Redis client not initialized');
      }

      // Remove expired entries
      await this.redis.zremrangebyscore(key, 0, windowStart);

      // Count current entries
      const currentCount = await this.redis.zcard(key);

      const remaining = Math.max(0, rule.maxRequests - currentCount);

      let resetAfterMs = rule.windowMs;
      if (currentCount >= rule.maxRequests) {
        const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        if (oldest.length > 0) {
          const oldestTime = parseInt(oldest[1], 10);
          resetAfterMs = Math.max(0, oldestTime + rule.windowMs - now);
        }
      }

      return { currentCount, remaining, resetAfterMs };
    } catch (error: any) {
      console.error('[RateLimiter] Status error:', error);
      return { currentCount: 0, remaining: rule.maxRequests, resetAfterMs: rule.windowMs };
    }
  }

  /**
   * Reset rate limit for a specific identifier
   */
  async reset(identifier: string, rule: RateLimitRule): Promise<boolean> {
    const key = `${this.config.redisPrefix}:${rule.id}:${identifier}`;
    try {
      if (!this.redis) {
        throw new Error('Redis client not initialized');
      }
      const result = await this.redis.del(key);
      return result === 1;
    } catch (error: any) {
      console.error('Rate limiter reset error:', error);
      return false;
    }
  }

  /**
   * Get current metrics (cloned to prevent external mutation)
   */
  getMetrics(): RateLimitMetrics {
    return cloneMetrics(this.metrics);
  }

  /**
   * Reset metrics to zero
   */
  resetMetrics(): void {
    this.metrics = createMetrics();
  }

  /**
   * Get the configuration
   */
  getConfig(): RateLimitConfig {
    return this.config;
  }
}
