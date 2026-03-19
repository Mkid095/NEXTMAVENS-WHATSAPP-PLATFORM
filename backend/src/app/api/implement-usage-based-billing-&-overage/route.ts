/**
 * Usage-Based Billing & Overage API
 * Endpoints for recording usage events, querying usage, and managing quotas
 * Protected by auth + orgGuard middleware.
 *
 * Base path: /api/usage
 */

import { z, ZodError } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { recordUsage, getCurrentUsage, getUsageAnalytics } from '../../../lib/implement-usage-based-billing-&-overage';

// ============================================================================
// Validation Schemas
// ============================================================================

const recordUsageBodySchema = z.object({
  meter: z.string().min(1).max(100), // e.g., "api_requests", "messages_sent"
  value: z.number().positive(),
  customerId: z.string().min(1).optional(), // defaults to org's Stripe customer ID
  timestamp: z.string().datetime().optional(),
  metadata: z.any().optional(),
});

const usageAnalyticsQuerySchema = z.object({
  meter: z.string().min(1).max(100),
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/usage/events
 * Record a usage event
 */
export async function recordUsageHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = recordUsageBodySchema.parse(request.body);
    const userId = (request as any).user?.id;
    const orgId = request.headers['x-org-id'] as string;

    if (!userId) {
      reply.code(401);
      return { success: false, error: 'Authentication required' };
    }

    if (!orgId) {
      reply.code(400);
      return { success: false, error: 'Missing x-org-id header' };
    }

    // Use provided customerId or fallback to org's Stripe customer ID
    const customerId = body.customerId || orgId; // In production, fetch org's stripeCustomerId

    const result = await recordUsage({
      orgId,
      customerId,
      meterName: body.meter,
      value: body.value,
      timestamp: body.timestamp ? new Date(body.timestamp) : undefined,
      metadata: body.metadata,
    });

    return {
      success: true,
      data: {
        eventId: result.eventId,
        currentUsage: result.currentUsage,
        quotaRemaining: result.quotaRemaining,
        overageWarning: result.overageWarning,
        message: result.message,
      },
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[UsageAPI] Error recording usage:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to record usage',
      details: error.message,
    });
  }
}

/**
 * GET /api/usage/current
 * Get current period usage for a meter
 */
export async function getCurrentUsageHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.headers['x-org-id'] as string;
    const { meter } = z.object({ meter: z.string().min(1) }).parse(request.query);

    const usage = await getCurrentUsage(orgId, meter);

    return {
      success: true,
      data: {
        meter: meter,
        usage: usage.usage,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
      },
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[UsageAPI] Error fetching current usage:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch usage',
    });
  }
}

/**
 * GET /api/usage/analytics
 * Get usage analytics over a date range
 */
export async function getAnalyticsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.headers['x-org-id'] as string;
    const query = usageAnalyticsQuerySchema.parse(request.query);

    const analytics = await getUsageAnalytics(
      orgId,
      query.meter,
      new Date(query.dateFrom),
      new Date(query.dateTo)
    );

    return {
      success: true,
      data: {
        meter: analytics.meterName,
        periodStart: analytics.periodStart,
        periodEnd: analytics.periodEnd,
        totalUsage: analytics.totalUsage,
        dailyBreakdown: analytics.dailyBreakdown.map((day) => ({
          date: day.date,
          value: day.value,
        })),
      },
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[UsageAPI] Error fetching analytics:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch analytics',
    });
  }
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerUsageRoutes(fastify: any) {
  fastify.post('/events', recordUsageHandler);
  fastify.get('/current', getCurrentUsageHandler);
  fastify.get('/analytics', getAnalyticsHandler);

  console.log('[UsageAPI] Registered usage-based billing routes under /api/usage');
}

export default registerUsageRoutes;
