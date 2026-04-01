/**
 * Quota Middleware
 *
 * Fastify plugin for enforcing quotas via HTTP middleware.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QuotaLimiter } from './quota-limiter.class';
import type { QuotaMiddlewareOptions, QuotaMetric } from './types';

/**
 * Register quota enforcement middleware with Fastify
 */
export async function quotaMiddleware(
  fastify: FastifyInstance,
  options: QuotaMiddlewareOptions
): Promise<void> {
  const { quotaLimiter, metrics, skip } = options;

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip if skip function provided and returns true
    if (skip && skip(request)) {
      return;
    }

    // orgGuard must have already set request.currentOrgId
    const orgId = (request as any).currentOrgId;
    if (!orgId) {
      // No org context - cannot enforce quotas
      return;
    }

    try {
      // Check all configured metrics
      for (const { metric, header, queryParam } of metrics) {
        // Determine amount (default 1)
        let amount = 1;
        if (header && request.headers[header.toLowerCase()]) {
          amount = parseInt(request.headers[header.toLowerCase()] as string, 10) || 1;
        } else if (queryParam && (request.query as any)[queryParam]) {
          amount = parseInt((request.query as any)[queryParam], 10) || 1;
        }

        // Perform quota check
        const result = await quotaLimiter.check(orgId, metric, amount);

        if (!result.allowed) {
          // Add quota headers for visibility
          reply.header('X-Quota-Limit', result.limit.toString());
          reply.header('X-Quota-Remaining', result.remaining.toString());
          reply.header('X-Quota-Reset', Math.ceil(result.resetAt.getTime() / 1000).toString());

          return reply.code(429)
            .header('Retry-After', Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString())
            .send({
              error: 'Quota exceeded',
              message: `Quota limit exceeded for ${metric}. Try again after ${result.resetAt.toISOString()}`,
              quota: {
                metric,
                current: result.current,
                limit: result.limit,
                remaining: result.remaining,
                resetAt: result.resetAt.toISOString()
              }
            });
        }

        // Add headers for successful checks too (informational)
        reply.header(`X-Quota-${metric}`, `${result.current}/${result.limit}`);
      }
    } catch (error: any) {
      console.error('Quota middleware error:', error);
      if (quotaLimiter['failOpen'] !== false) {
        return; // Allow on error (fail open)
      }
      return reply.code(500).send({ error: 'Quota check failed', message: error.message });
    }
  });
}
