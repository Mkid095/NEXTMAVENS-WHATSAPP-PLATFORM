/**
 * Fastify Hooks for Idempotency
 *
 * Registers onSend hook to store responses after they are sent.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getIdempotencyManager } from './singleton';

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
