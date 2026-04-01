/**
 * Idempotency Middleware
 *
 * Fastify request handler for checking idempotency cache.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getIdempotencyManager } from './singleton';
import type { CachedResponse } from './types';

/**
 * Check idempotency cache for a request.
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
