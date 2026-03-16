/**
 * Rate Limiting Middleware Wrapper
 *
 * Integrates the Redis sliding window rate limiter into the global preHandler.
 * Uses the global rate limiter singleton with rule-based configuration.
 */

import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { getRateLimiter, generateIdentifier } from '../lib/rate-limiting-with-redis/index.js';

/**
 * Rate limit check middleware - use in preHandler
 *
 * Checks the request against configured rate limit rules.
 * Returns 429 if limit exceeded.
 */
export async function rateLimitCheck(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: FastifyError | undefined) => void
): Promise<void> {
  try {
    const limiter = getRateLimiter();
    if (!limiter || !limiter.config.enabled) {
      return done(); // Rate limiting disabled
    }

    const endpoint = request.routerPath || request.url;
    const orgId = (request as any).currentOrgId;
    const instanceId = request.headers['x-instance-id'] as string | undefined;

    // Find the most specific matching rule
    const rule = limiter.findRule(endpoint, orgId, instanceId);

    // Generate identifier: combines org, instance, IP
    const identifier = generateIdentifier(request, orgId, instanceId);

    // Check rate limit
    const result = await limiter.check(identifier, rule);

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', rule.maxRequests.toString());
    reply.header('X-RateLimit-Remaining', result.remaining.toString());
    reply.header('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + result.resetAfterMs / 1000).toString());

    if (!result.allowed) {
      reply.code(429);
      reply.header('Retry-After', Math.ceil(result.resetAfterMs / 1000).toString());
      reply.send({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(result.resetAfterMs / 1000)} seconds.`,
        limit: rule.maxRequests,
        windowMs: rule.windowMs,
      });
      return done(); // Response sent, stop
    }

    return done();
  } catch (error: any) {
    console.error('Rate limit middleware error:', error);
    // Fail open on errors - don't block request
    return done();
  }
}
