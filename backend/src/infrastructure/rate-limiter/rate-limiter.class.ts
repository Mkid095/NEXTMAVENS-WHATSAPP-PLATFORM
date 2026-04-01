/**
 * Redis Sliding Window Rate Limiter
 * Uses sorted sets for efficient rate limiting with Redis
 */

import type { RateLimitConfig, RateLimitRule, RateLimitResult, RateLimitMetrics } from './types';
import { cleanupExpiredKeysImplementation } from './cleanup.operations';
import { checkImplementation } from './check.operations';
import { getStatusImplementation } from './status.operations';
import { findRuleImplementation } from './rule-matching.operations';
import { updateMetricsImplementation } from './metrics.operations';

/**
 * Redis sliding window rate limiter implementation.
 * Uses sorted sets: ZADD with timestamp, ZREMRANGEBYSCORE for cleanup, ZCARD for count
 */
export class RedisSlidingWindowRateLimiter {
  private config: RateLimitConfig;
  private redis: any; // Redis client
  private metrics: RateLimitMetrics;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig, redisClient: any) {
    this.config = config;
    this.redis = redisClient;
    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      byRule: {},
      byOrg: {},
      lastCleanup: new Date()
    };
  }

  /**
   * Start periodic cleanup of expired rate limit keys
   */
  startBackgroundCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      cleanupExpiredKeysImplementation(this).catch(console.error);
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
   * Check if a request is allowed and update counters
   */
  async check(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const result = await checkImplementation(this, identifier, rule);
    updateMetricsImplementation(this, rule, identifier, result.allowed);
    return result;
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getStatus(identifier: string, rule: RateLimitRule): Promise<{
    currentCount: number;
    remaining: number;
    resetAfterMs: number;
  }> {
    return getStatusImplementation(this, identifier, rule);
  }

  /**
   * Reset rate limit for a specific identifier (admin operation)
   */
  async reset(identifier: string, rule: RateLimitRule): Promise<boolean> {
    const key = `${this.config.redisPrefix}:${rule.id}:${identifier}`;
    try {
      const result = await this.redis.del(key);
      return result === 1;
    } catch (error) {
      console.error('Rate limiter reset error:', error);
      return false;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): RateLimitMetrics {
    return {
      ...this.metrics,
      byRule: JSON.parse(JSON.stringify(this.metrics.byRule)),
      byOrg: JSON.parse(JSON.stringify(this.metrics.byOrg))
    };
  }

  /**
   * Reset metrics to zero
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      byRule: {},
      byOrg: {},
      lastCleanup: new Date()
    };
  }

  /**
   * Find the applicable rate limit rule for a given endpoint and optional org/instance IDs.
   * Matches rules based on endpoint pattern, orgId, and instanceId with priority.
   * Priority: org+instance > org > instance > endpoint > default
   */
  findRule(endpoint: string, orgId?: string, instanceId?: string): RateLimitRule {
    return findRuleImplementation(this.config, endpoint, orgId, instanceId);
  }
}
