/**
 * Rate Limiter Fastify Middleware
 */

import type { RateLimitRule } from './types';
import { RateLimiterInstance } from './rate-limiter-instance.class';

/**
 * Fastify middleware options
 */
export interface RateLimitMiddlewareOptions {
  /** Rate limiter instance */
  limiter: RateLimiterInstance;
  /** Header to use for org ID (default: x-org-id) */
  orgIdHeader?: string;
  /** Header to use for instance ID (default: x-instance-id) */
  instanceIdHeader?: string;
  /** Skip rate limiting for certain paths (regex or function) */
  skip?: (req: any) => boolean;
  /** Key generator: create unique identifier for rate limit */
  keyGenerator?: (req: any) => string;
}

/**
 * Fastify middleware for rate limiting
 */
export function rateLimitMiddleware(options: RateLimitMiddlewareOptions): any {
  const { limiter, orgIdHeader = 'x-org-id', instanceIdHeader = 'x-instance-id', skip, keyGenerator } = options;

  return async (request: any, reply: any, done: any) => {
    try {
      // Check if global rate limiting is enabled
      if (!limiter.config.enabled) {
        return done();
      }

      // Skip if configured
      if (skip && skip(request)) {
        return done();
      }

      const endpoint = request.routeOptions?.path || request.routerPath || request.url;
      const orgId = request.headers[orgIdHeader] as string | undefined;
      const instanceId = request.headers[instanceIdHeader] as string | undefined;

      // Find applicable rule
      const rule = limiter.findRule(endpoint, orgId, instanceId);

      // Generate identifier (org:instance:ip or org:ip, etc.)
      const identifier = keyGenerator
        ? keyGenerator(request)
        : generateIdentifier(request, orgId, instanceId);

      // Check rate limit
      const result = await limiter.check(identifier, rule);

      // Add rate limit headers to response
      reply.header('X-RateLimit-Limit', rule.maxRequests.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + result.resetAfterMs / 1000).toString());

      if (!result.allowed) {
        reply.code(429);
        reply.header('Retry-After', Math.ceil(result.resetAfterMs / 1000).toString());
        reply.send({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil(result.resetAfterMs / 1000)} seconds`,
          retryAfter: Math.ceil(result.resetAfterMs / 1000),
          limit: rule.maxRequests,
          windowMs: rule.windowMs
        });
        return done(new Error('Rate limit exceeded') as any);
      }

      return done();
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      // Fail open on errors
      return done();
    }
  };
}

/**
 * Generate rate limit identifier
 * Format: org:{orgId}:ip:{ip} or org:{orgId}:instance:{instanceId} or instance:{instanceId}:ip:{ip} or ip:{ip}
 */
export function generateIdentifier(req: any, orgId?: string, instanceId?: string): string {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  if (orgId) {
    if (instanceId) {
      return `org:${orgId}:instance:${instanceId}:ip:${ip}`;
    }
    return `org:${orgId}:ip:${ip}`;
  }

  if (instanceId) {
    return `instance:${instanceId}:ip:${ip}`;
  }

  return `ip:${ip}`;
}
