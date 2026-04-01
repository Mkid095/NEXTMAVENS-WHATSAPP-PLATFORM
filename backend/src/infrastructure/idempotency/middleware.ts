/**
 * Idempotency Fastify Middleware
 * Provides hook registration and request checking utilities
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IdempotencyManager } from './idempotency-manager.class';
import { getIdempotencyManager } from './singleton';
import type { CachedResponse } from './types';

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
