/**
 * Quota Enforcement Middleware Wrapper
 *
 * Integrates the QuotaLimiter into the global preHandler pipeline.
 * Checks API usage quotas for the current organization.
 */

import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { getQuotaLimiter, QuotaMetric } from '../../lib/implement-quota-enforcement-middleware/index.js';

/**
 * Quota check middleware - use in preHandler
 *
 * Checks quota for the given metric (default: API_CALLS) with configurable amount.
 * Fails open on errors (allows request) but logs warning.
 */
export async function quotaCheck(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: FastifyError | undefined) => void
): Promise<void> {
  try {
    const quotaLimiter = getQuotaLimiter();
    const orgId = (request as any).currentOrgId;

    if (!orgId) {
      // No org context - cannot enforce quota, skip
      return done();
    }

    // Determine metric based on route or header
    const path = request.routerPath || request.url;
    let metric = QuotaMetric.API_CALLS; // default for generic API calls

    // Override via header if provided (for specific metrics)
    const metricHeader = request.headers['x-quota-metric'] as string | undefined;
    if (metricHeader && Object.values(QuotaMetric).includes(metricHeader as any)) {
      metric = metricHeader as QuotaMetric;
    } else if (path.includes('/messages') || path.includes('/send')) {
      metric = QuotaMetric.MESSAGES_SENT;
    } else if ((path.includes('/instances') || path.includes('/whatsapp')) && !path.includes('/admin')) {
      // ACTIVE_INSTANCES quota only for non-admin instance operations (admin endpoints are read-only)
      metric = QuotaMetric.ACTIVE_INSTANCES;
    }

    // Amount: read from header or query, default 1
    let amount = 1;
    const amountHeader = request.headers['x-quota-amount'] as string | undefined;
    if (amountHeader) {
      amount = parseInt(amountHeader, 10) || 1;
    } else if ((request.query as any)?.amount) {
      amount = parseInt((request.query as any).amount, 10) || 1;
    }

    // Perform quota check
    const result = await quotaLimiter.check(orgId, metric, amount);

    // Add headers for visibility
    reply.header('X-Quota-Limit', result.limit.toString());
    reply.header('X-Quota-Remaining', result.remaining.toString());
    if (result.resetAt) {
      reply.header('X-Quota-Reset', Math.ceil(result.resetAt.getTime() / 1000).toString());
    }

    if (!result.allowed) {
      reply.code(429);
      reply.header('Retry-After', Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString());
      reply.send({
        error: 'Quota exceeded',
        message: `Quota limit exceeded for ${metric}. Current: ${result.current}, Limit: ${result.limit}. Resets at ${result.resetAt.toISOString()}`,
        quota: {
          metric,
          current: result.current,
          limit: result.limit,
          remaining: result.remaining,
          resetAt: result.resetAt.toISOString()
        }
      });
      return done(); // Response sent, stop processing
    }

    // Informational header even on success (optional)
    reply.header(`X-Quota-${metric}`, `${result.current}/${result.limit}`);

    return done();
  } catch (error: any) {
    console.error('Quota middleware error:', error);
    // Quota check errors should not block requests (fail open)
    // But if failOpen is disabled in future, we might want to error
    return done(); // Continue processing even if quota check fails
  }
}
