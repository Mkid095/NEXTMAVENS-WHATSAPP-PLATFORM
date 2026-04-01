/**
 * Idempotency Utilities
 */

import type { FastifyRequest } from 'fastify';

/**
 * Generate cache key from request
 * Format: {prefix}:{method}:{url}:{bodyHash} or {prefix}:{keyHeader}
 */
export function buildCacheKey(req: FastifyRequest, config: any): string | null {
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
export function hashBody(body: Buffer | string | undefined): string {
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
export function serializeResponse(res: any): string {
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
export function deserializeResponse(data: string): any | null {
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
