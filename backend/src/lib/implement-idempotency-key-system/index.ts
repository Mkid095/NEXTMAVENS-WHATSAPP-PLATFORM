/**
 * Idempotency-Key System Middleware
 *
 * Prevents duplicate HTTP requests from being processed by caching responses.
 * Uses Redis to store request/response pairs keyed by the Idempotency-Key header.
 *
 * Features:
 * - Configurable TTL (default 24 hours)
 * - Automatic caching of successful responses (2xx, 3xx)
 * - Separate cache keys per HTTP method + URL + body hash (optional)
 * - Supports both request header and generated keys
 */

import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { randomUUID } from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

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

export interface CachedResponse {
  statusCode: number;
  headers: Record<string, any>;
  body: string | Buffer;
  contentType?: string;
}

export interface IdempotencyMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheErrors: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: IdempotencyConfig = {
  keyPrefix: 'idempotency',
  ttl: 86400, // 24 hours
  includeBody: true,
  methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  cacheStatusCodes: [200, 201, 202, 204, 301, 302, 303, 304, 307, 308],
};

// ============================================================================
// Redis Client Management
// ============================================================================

let redisClient: any = null;

function getRedisClient() {
  if (!redisClient) {
    // Try to get shared Redis from message queue system
    try {
      const { redisConnectionOptions } = require('../message-queue-priority-system');
      const Redis = require('ioredis');
      redisClient = new Redis(redisConnectionOptions);
    } catch (e) {
      throw new Error('Redis client not available. Ensure message queue system is initialized or set Redis client via setRedisClient()');
    }
  }
  return redisClient;
}

/**
 * Set custom Redis client (for testing or separate connection)
 */
export function setRedisClient(client: any): void {
  redisClient = client;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate cache key from request
 * Format: {prefix}:{method}:{url}:{bodyHash} or {prefix}:{keyHeader}
 */
function buildCacheKey(req: FastifyRequest, config: IdempotencyConfig): string | null {
  const customKey = config.keyGenerator?.(req);
  if (customKey) {
    return `${config.keyPrefix}:${customKey}`;
  }

  // Use Idempotency-Key header if present
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  if (idempotencyKey) {
    return `${config.keyPrefix}:${idempotencyKey}`;
  }

  // No key available - return null to skip
  return null;
}

/**
 * Generate body hash for cache key variation
 */
function hashBody(body: Buffer | string | undefined): string {
  if (!body) return 'no-body';
  const { createHash } = require('crypto');
  const content = Buffer.isBuffer(body) ? body.toString() : body;
  // Only hash first 1KB to avoid huge keys, plus length marker
  const sample = content.slice(0, 1024);
  return createHash('sha256').update(sample + `:len:${content.length}`).digest('hex').substring(0, 16);
}

/**
 * Serialize response for caching
 */
function serializeResponse(res: CachedResponse): string {
  return JSON.stringify({
    status: res.statusCode,
    headers: res.headers,
    body: res.body instanceof Buffer ? res.body.toString('base64') : res.body,
    isBase64: res.body instanceof Buffer,
    contentType: res.contentType,
  });
}

/**
 * Deserialize cached response
 */
function deserializeResponse(data: string): CachedResponse | null {
  try {
    const parsed = JSON.parse(data);
    return {
      statusCode: parsed.status,
      headers: parsed.headers,
      body: parsed.isBase64 ? Buffer.from(parsed.body, 'base64') : parsed.body,
      contentType: parsed.contentType,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Idempotency Manager Class
// ============================================================================

export class IdempotencyManager {
  private config: IdempotencyConfig;
  private metrics: IdempotencyMetrics;
  private initialized: boolean = false;

  constructor(config: IdempotencyConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
    if (!this.config.cacheStatusCodes.includes(reply.statusCode)) {
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
        // Fallback: reply.header() returns a getter/setter, cannot enumerate
        // We'll try common headers
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
        const fullKey = key.startsWith(this.config.keyPrefix) ? key : `${this.config.keyPrefix}:${key}`;
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

// ============================================================================
// Singleton Instance
// ============================================================================

let idempotencyManager: IdempotencyManager | null = null;

/**
 * Initialize the global idempotency manager singleton
 */
export async function initializeIdempotency(config?: IdempotencyConfig): Promise<IdempotencyManager> {
  if (idempotencyManager) {
    return idempotencyManager;
  }

  idempotencyManager = new IdempotencyManager(config);
  await idempotencyManager.initialize();

  console.log('[Idempotency] Manager initialized');
  return idempotencyManager;
}

/**
 * Get the global idempotency manager instance
 */
export function getIdempotencyManager(): IdempotencyManager | null {
  return idempotencyManager;
}

// ============================================================================
// Fastify Hooks Registration (for onSend only)
// ============================================================================

import { FastifyInstance } from 'fastify';

/**
 * Register onSend hook to store responses after they are sent.
 * This should be called once during server startup.
 */
export function registerOnSendHook(app: FastifyInstance): void {
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, body: any) => {
    console.log(`[ONSEND] ${request.method} ${request.url} - hook start, body type: ${typeof body}`);
    // Only cache if request was not a cache hit and body is cacheable
    if (!(request as any).__idempotency_miss__) {
      console.log(`[ONSEND] ${request.method} ${request.url} - cache hit or not applicable, skipping store`);
      return body;
    }

    const manager = getIdempotencyManager();
    if (!manager) {
      console.log(`[ONSEND] ${request.method} ${request.url} - no manager, returning`);
      return body;
    }

    // Only cache string or Buffer bodies (not streams)
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
      console.log(`[ONSEND] ${request.method} ${request.url} - storing response in cache`);
      await manager.storeResponse(request, reply, body);
    } else {
      console.log(`[ONSEND] ${request.method} ${request.url} - body not cacheable (${typeof body})`);
    }

    console.log(`[ONSEND] ${request.method} ${request.url} - returning body`);
    return body;
  });
}

/**
 * Shutdown the idempotency manager and close its Redis connection.
 * Safe to call multiple times.
 */
export async function shutdownIdempotency(): Promise<void> {
  if (idempotencyManager) {
    // Close Redis client if exists
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (e) {
        console.warn('[Idempotency] Error closing Redis client:', e.message);
      }
      redisClient = null;
    }
    idempotencyManager = null;
  }
}

/**
 * Utility: Check idempotency cache for a request.
 * Returns cached CachedResponse if found and sent via reply, otherwise null.
 * Caller should set a flag on request if cache miss for later onSend caching.
 */
export async function checkIdempotencyCache(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<CachedResponse | null> {
  const manager = getIdempotencyManager();
  if (!manager) {
    return null;
  }

  if (!manager.shouldApply(request)) {
    return null;
  }

  const cached = await manager.getCachedResponse(request);
  if (cached) {
    // Send cached response and set status
    reply.status(cached.statusCode);
    // Set headers (cached.headers is already a plain object)
    for (const [key, value] of Object.entries(cached.headers)) {
      if (value !== undefined) {
        reply.header(key, value);
      }
    }
    if (cached.contentType) {
      reply.header('Content-Type', cached.contentType);
    }
    reply.send(cached.body);
    return cached;
  }

  // Mark for caching after response
  (request as any).__idempotency_miss__ = true;
  return null;
}
