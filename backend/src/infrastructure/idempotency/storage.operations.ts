/**
 * Idempotency Storage Operations
 * Implementation of cache get/store logic (extracted from class)
 */

import { getRedisClient } from './redis-client';
import { buildCacheKey } from './utils';
import { deserializeResponse, serializeResponse } from './utils';
import type { CachedResponse } from './types';

/**
 * Get cached response implementation (extracted from IdempotencyManager)
 */
export async function getCachedResponseImplementation(
  manager: any,
  req: any
): Promise<CachedResponse | null> {
  manager.metrics.totalRequests++;

  const cacheKey = buildCacheKey(req, manager.config);
  if (!cacheKey) {
    return null; // No key, cannot cache
  }

  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      manager.metrics.cacheHits++;
      const response = deserializeResponse(cached);
      if (response) {
        return response;
      }
      // Corrupted cache entry, treat as miss
      manager.metrics.cacheErrors++;
    }
  } catch (error) {
    console.error('[Idempotency] Get error:', error);
    manager.metrics.cacheErrors++;
  }

  manager.metrics.cacheMisses++;
  return null;
}

/**
 * Extract headers from FastifyReply as plain object
 */
function extractReplyHeaders(reply: any): Record<string, any> {
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
  return replyHeaders;
}

/**
 * Store response in cache implementation (extracted from IdempotencyManager)
 */
export async function storeResponseImplementation(
  manager: any,
  req: any,
  reply: any,
  body: string | Buffer
): Promise<void> {
  const cacheKey = buildCacheKey(req, manager.config);
  if (!cacheKey) return;

  // Only cache certain status codes
  if (!manager.config.cacheStatusCodes.includes(reply.statusCode)) {
    return;
  }

  try {
    const redis = getRedisClient();

    // Extract headers as plain object
    const replyHeaders = extractReplyHeaders(reply);

    const cached: CachedResponse = {
      statusCode: reply.statusCode,
      headers: replyHeaders,
      body,
      contentType: reply.getHeader('content-type') as string | undefined,
    };

    const serialized = serializeResponse(cached);
    await redis.setex(cacheKey, manager.config.ttl, serialized);
  } catch (error) {
    console.error('[Idempotency] Set error:', error);
    manager.metrics.cacheErrors++;
  }
}
