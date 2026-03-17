/**
 * Quota Enforcement Admin API Routes
 *
 * Base path: /admin/quotas
 * Endpoints:
 * - GET    /usage                - Get quota usage for an organization
 * - POST   /reset                - Reset quota usage for an organization
 * - GET    /limits               - List all quota limits per plan
 * - GET    /health               - Get organizations approaching their limits
 *
 * Access: Requires authentication + orgGuard (already in global pipeline)
 * SUPER_ADMIN can view any org; ORG_ADMIN can view their own org only.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getQuotaLimiter, QuotaLimiter, QuotaMetric, QuotaPeriod, getPlanLimit } from '../../../lib/implement-quota-enforcement-middleware';

// ============================================================================
// Zod Schemas
// ============================================================================

const usageQuerySchema = z.object({
  orgId: z.string().optional(),
  metric: z.enum(['messages_sent', 'active_instances', 'api_calls', 'storage_usage']).optional(),
  period: z.enum(['hourly', 'daily', 'monthly']).optional().default('daily')
});

const resetSchema = z.object({
  orgId: z.string().optional(),
  metric: z.enum(['messages_sent', 'active_instances', 'api_calls', 'storage_usage']).optional(),
  period: z.enum(['hourly', 'daily', 'monthly']).optional().default('daily')
});

// ============================================================================
// Plugin Registration
// ============================================================================

export default async function (fastify: FastifyInstance) {
  // Ensure quota limiter is initialized
  const limiter = getQuotaLimiter();

  // Determine accessible org: SUPER_ADMIN can use any orgId from query, others limited to their org
  const getAuthorizedOrgId = (request: FastifyRequest) => {
    const user = (request as any).user;
    const currentOrgId = (request as any).currentOrgId;
    const queryOrgId = (request.query as any)?.orgId;

    if (user?.role === 'SUPER_ADMIN') {
      return queryOrgId || currentOrgId; // SUPER_ADMIN can specify any org, defaults to their own (unlikely)
    }
    // Non-admins: can only access their own org; ignore query orgId
    return currentOrgId;
  };

  // ------------------------------------------------------------------------
  // GET /usage - Get quota usage for current org (or specified if SUPER_ADMIN)
  // ------------------------------------------------------------------------
  fastify.get(
    '/usage',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const orgId = getAuthorizedOrgId(request);
        if (!orgId) {
          reply.code(400);
          return { error: 'Organization ID required' };
        }

        // Validate query parameters using Zod
        const query = usageQuerySchema.parse(request.query || {});
        const { metric, period = 'daily' } = query;

        // If metric provided, return single metric; else return all metrics
        if (metric) {
          const current = await limiter.getUsage(orgId, metric as QuotaMetric, period as QuotaPeriod);
          // Get org plan to include limit
          const org = await limiter['prisma'].organization.findUnique({
            where: { id: orgId },
            select: { plan: true }
          });
          const plan = org?.plan || 'FREE';
          const limit = getPlanLimit(plan, metric as QuotaMetric);
          const remaining = Math.max(0, limit - current);

          return {
            orgId,
            metric,
            period: period || 'daily',
            current,
            limit,
            remaining,
            percentUsed: limit > 0 ? (current / limit) * 100 : 0
          };
        } else {
          // Return all metrics for the period
          const metrics: QuotaMetric[] = [
            QuotaMetric.MESSAGES_SENT,
            QuotaMetric.ACTIVE_INSTANCES,
            QuotaMetric.API_CALLS,
            QuotaMetric.STORAGE_USAGE
          ];
          const org = await limiter['prisma'].organization.findUnique({
            where: { id: orgId },
            select: { plan: true }
          });
          const plan = org?.plan || 'FREE';
          const results: any[] = [];

          for (const m of metrics) {
            const current = await limiter.getUsage(orgId, m, (period || 'daily') as QuotaPeriod);
            const limit = getPlanLimit(plan, m);
            results.push({
              metric: m,
              current,
              limit,
              remaining: Math.max(0, limit - current),
              percentUsed: limit > 0 ? (current / limit) * 100 : 0
            });
          }

          return {
            orgId,
            period: period || 'daily',
            metrics: results
          };
        }
      } catch (error: any) {
        console.error('Quota usage error:', error);
        reply.code(500);
        return { error: 'Failed to retrieve quota usage', message: error.message };
      }
    }
  );

  // ------------------------------------------------------------------------
  // POST /reset - Reset quota usage for an organization
  // ------------------------------------------------------------------------
  fastify.post(
    '/reset',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user;
        const currentOrgId = (request as any).currentOrgId;

        // Validate request body using Zod
        const body = resetSchema.parse(request.body || {});
        const { orgId, metric, period = 'daily' } = body;

        // Authorize orgId
        let targetOrgId = orgId;
        if (user?.role !== 'SUPER_ADMIN') {
          // Non-admins can only reset their own org
          if (orgId && orgId !== currentOrgId) {
            reply.code(403);
            return { error: 'Access denied: Cannot reset quotas for other organizations' };
          }
          targetOrgId = currentOrgId;
        }
        if (!targetOrgId) {
          reply.code(400);
          return { error: 'Organization ID required' };
        }

        const success = await limiter.reset(
          targetOrgId,
          metric as QuotaMetric | undefined,
          (period || 'daily') as QuotaPeriod
        );

        return {
          success,
          message: success
            ? `Quota reset for ${targetOrgId}${metric ? ` (${metric})` : ''}`
            : 'No quota usage found to reset',
          orgId: targetOrgId,
          metric,
          period: period || 'daily'
        };
      } catch (error: any) {
        console.error('Quota reset error:', error);
        reply.code(500);
        return { error: 'Failed to reset quota', message: error.message };
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /limits - Return all quota limits per plan
  // ------------------------------------------------------------------------
  fastify.get(
    '/limits',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Return the hardcoded PLAN_QUOTAS (readonly)
        // We need to import PLAN_QUOTAS; it's not exported individually, so we import from the module
        const { PLAN_QUOTAS } = await import('../../../lib/implement-quota-enforcement-middleware');

        return {
          plans: Object.keys(PLAN_QUOTAS).map(plan => ({
            plan,
            ...PLAN_QUOTAS[plan as keyof typeof PLAN_QUOTAS]
          }))
        };
      } catch (error: any) {
        console.error('Quota limits error:', error);
        reply.code(500);
        return { error: 'Failed to retrieve quota limits', message: error.message };
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /health - Organizations approaching their quota limits
  // ------------------------------------------------------------------------
  fastify.get(
    '/health',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Only SUPER_ADMIN can view system health
        const user = (request as any).user;
        if (user?.role !== 'SUPER_ADMIN') {
          reply.code(403);
          return { error: 'Access denied: Requires SUPER_ADMIN role' };
        }

        // Default threshold: 90% usage
        const threshold = 0.9;
        const nearLimit = await limiter.getNearLimitOrgs(1 - threshold);

        return {
          timestamp: new Date().toISOString(),
          thresholdPercent: threshold * 100,
          totalOrgsNearLimit: nearLimit.length,
          orgs: nearLimit
        };
      } catch (error: any) {
        console.error('Quota health error:', error);
        reply.code(500);
        return { error: 'Failed to retrieve quota health', message: error.message };
      }
    }
  );
}
