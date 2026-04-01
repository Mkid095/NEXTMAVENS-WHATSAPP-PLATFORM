/**
 * Idempotency Manager Class
 *
 * Core manager for caching and retrieving request responses.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from './redis.client';
import type { IdempotencyConfig, CachedResponse, IdempotencyMetrics } from './types';
import { DEFAULT_IDEMPOTENCY_CONFIG } from './config';
import { buildCacheKey } from './utils';
import { deserializeResponse, serializeResponse } from './utils';

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
    // Ensure Redis client is connected
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
  async getCachedResponse(req: FastifyRequest): Promise<CachedResponse | null> {
    this.metrics.totalRequests++;

    const cacheKey = buildCacheKey(req, this.config);
    if (!cacheKey) {
      return null; // No key, cannot cache
    }

    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        const response = deserializeResponse(cached);
        if (response) {
          return response;
        }
        // Corrupted cache entry, treat as miss
        this.metrics.cacheErrors++;
      }
    } catch (error) {
      console.error('[Idempotency] Get error:', error);
      this.metrics.cacheErrors++;
    }

    this.metrics.cacheMisses++;
    return null;
  }

  /**
   * Store response in cache
   */
  async storeResponse(req: FastifyRequest, reply: FastifyReply, body: string | Buffer): Promise<void> {
    const cacheKey = buildCacheKey(req, this.config);
    if (!cacheKey) return;

    // Only cache certain status codes
    if (!this.config.cacheStatusCodes?.includes(reply.statusCode)) {
      return;
    }

    try {
      const redis = getRedisClient();

      // Extract headers as plain object
      const replyHeaders: Record<string, any> = {};
      if (reply.raw && reply.raw.getHeaders) {
        const rawHeaders = reply.raw.getHeaders();
        for (const [key, value] of Object.entries(rawHeaders)) {
          replyHeaders[key] = value as any;
        }
      } else {
        // Fallback: try common headers
        const contentType = reply.getHeader('content-type');
        if (contentType) replyHeaders['content-type'] = contentType;
      }

      const cached: CachedResponse = {
        statusCode: reply.statusCode,
        headers: replyHeaders,
        body,
        contentType: reply.getHeader('content-type') as string | undefined,
      };

      const serialized = serializeResponse(cached);
      await redis.setex(cacheKey, this.config.ttl, serialized);
    } catch (error) {
      console.error('[Idempotency] Set error:', error);
      this.metrics.cacheErrors++;
    }
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
        const fullKey = key.startsWith(this.config.keyPrefix!) ? key : `${this.config.keyPrefix}:${key}`;
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
  shouldApply(req: FastifyRequest): boolean {
    if (this.config.methods && !this.config.methods.includes(req.method)) {
      return false;
    }
    if (this.config.skip && this.config.skip(req)) {
      return false;
    }
    return true;
  }
}
