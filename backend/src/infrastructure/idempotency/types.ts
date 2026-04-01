/**
 * Idempotency System Types
 */

import type { FastifyRequest } from 'fastify';

/**
 * Idempotency configuration
 */
export interface IdempotencyConfig {
  /** Redis key prefix (default: 'idempotency') */
  keyPrefix?: string;
  /** TTL in seconds (default: 86400 = 24 hours) */
  ttl?: number;
  /** Include request body in cache key (default: true) */
  includeBody?: boolean;
  /** HTTP methods to apply idempotency to (default: all except GET/HEAD) */
  methods?: string[];
  /** Status codes to cache (default: 2xx, 3xx) */
  cacheStatusCodes?: number[];
  /** Skip function to bypass idempotency for certain requests */
  skip?: (req: FastifyRequest) => boolean;
  /** Custom key generator (default: uses Idempotency-Key header) */
  keyGenerator?: (req: FastifyRequest) => string | null;
}

/**
 * Cached response stored in Redis
 */
export interface CachedResponse {
  statusCode: number;
  headers: Record<string, any>;
  body: string | Buffer;
  contentType?: string;
}

/**
 * Idempotency metrics
 */
export interface IdempotencyMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheErrors: number;
}
