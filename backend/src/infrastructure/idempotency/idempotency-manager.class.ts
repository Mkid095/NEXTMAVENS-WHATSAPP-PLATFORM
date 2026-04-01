/**
 * Idempotency Manager Class
 * Core implementation for idempotency caching
 */

import type { IdempotencyConfig, CachedResponse, IdempotencyMetrics } from './types';
import { DEFAULT_IDEMPOTENCY_CONFIG } from './config';
import { getRedisClient } from './redis-client';
import { getCachedResponseImplementation, storeResponseImplementation } from './storage.operations';

/**
 * Manages idempotency caching for HTTP requests
 */
export class IdempotencyManager {
  private config: IdempotencyConfig;
  private metrics: IdempotencyMetrics;
  private initialized: boolean = false;

  constructor(config: IdempotencyConfig = {}) {
    this.config = { ...DEFAULT_IDEMPOTENCY_CONFIG, ...config };
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheErrors: 0,
    };
  }

  /**
   * Initialize the manager (connect to Redis, etc.)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const redis = getRedisClient();
    if (redis && typeof redis.connect === 'function') {
      await redis.connect().catch(() => {});
    }
    this.initialized = true;
    console.log('[Idempotency] Initialized', { ttl: this.config.ttl });
  }

  /**
   * Check if a cached response exists for this request
   * Returns cached response or null
   */
  async getCachedResponse(req: any): Promise<CachedResponse | null> {
    return getCachedResponseImplementation(this, req);
  }

  /**
   * Store response in cache
   */
  async storeResponse(req: any, reply: any, body: string | Buffer): Promise<void> {
    return storeResponseImplementation(this, req, reply, body);
  }

  /**
   * Invalidate cache entry for given key(s)
   */
  async invalidate(keyOrKeys: string | string[]): Promise<number> {
    try {
      const redis = getRedisClient();
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      let deleted = 0;
      for (const key of keys) {
        const fullKey = key.startsWith(this.config.keyPrefix || 'idempotency') ? key : `${this.config.keyPrefix}:${key}`;
        const result = await redis.del(fullKey);
        deleted += result;
      }
      return deleted;
    } catch (error) {
      console.error('[Idempotency] Invalidate error:', error);
      return 0;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): IdempotencyMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheErrors: 0,
    };
  }

  /**
   * Check if request should be idempotent (method matches)
   */
  shouldApply(req: any): boolean {
    if (this.config.methods && !this.config.methods.includes(req.method)) {
      return false;
    }
    if (this.config.skip && this.config.skip(req)) {
      return false;
    }
    return true;
  }
}
