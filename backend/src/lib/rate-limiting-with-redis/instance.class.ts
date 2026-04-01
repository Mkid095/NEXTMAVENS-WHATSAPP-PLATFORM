/**
 * Rate Limiter Instance Wrapper
 * Provides a simplified interface over the core limiter
 */

import type { RateLimitConfig, RateLimitRule, RateLimitResult } from './types';
import { RedisSlidingWindowRateLimiter } from './limiter.class';

export class RateLimiterInstance {
  private limiter: RedisSlidingWindowRateLimiter;
  public readonly config: RateLimitConfig;

  constructor(limiter: RedisSlidingWindowRateLimiter, config: RateLimitConfig) {
    this.limiter = limiter;
    this.config = config;
  }

  /**
   * Start background cleanup
   */
  start(): void {
    this.limiter.startBackgroundCleanup();
  }

  /**
   * Stop background cleanup
   */
  stop(): void {
    this.limiter.stopBackgroundCleanup();
  }

  /**
   * Check if a request is allowed
   */
  async check(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
    return this.limiter.check(identifier, rule);
  }

  /**
   * Get rate limit status without incrementing
   */
  async getStatus(identifier: string, rule: RateLimitRule): Promise<{
    currentCount: number;
    remaining: number;
    resetAfterMs: number;
  }> {
    return this.limiter.getStatus(identifier, rule);
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string, rule: RateLimitRule): Promise<boolean> {
    return this.limiter.reset(identifier, rule);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return this.limiter.getMetrics();
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.limiter.resetMetrics();
  }

  /**
   * Find the applicable rule for a request
   */
  findRule(endpoint: string, orgId?: string, instanceId?: string): RateLimitRule {
    return this.limiter.findRule(endpoint, orgId, instanceId);
  }
}
