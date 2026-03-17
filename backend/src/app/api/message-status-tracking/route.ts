/**
 * Message Status Tracking Admin API
 *
 * Endpoints for viewing and managing message status history.
 * Protected by auth + orgGuard middleware (SUPER_ADMIN only effectively).
 *
 * Base path: /admin (registered separately)
 */

import { z, ZodError } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  updateMessageStatus,
  getStatusHistory,
  getStatusMetrics,
  MessageStatus,
  StatusChangeReason
} from '../../../lib/message-status-tracking';

// ============================================================================
// Validation Schemas
// ============================================================================

const statusUpdateSchema = z.object({
  status: z.nativeEnum(MessageStatus),
  reason: z.nativeEnum(StatusChangeReason).optional(),
  changedBy: z.string().optional(),
  metadata: z.any().optional()
});

const historyQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  status: z.nativeEnum(MessageStatus).optional(),
  reason: z.nativeEnum(StatusChangeReason).optional()
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /admin/messages/:messageId/status
 * Update the status of a specific message (admin only)
 */
export async function updateMessageStatusHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { messageId } = request.params as { messageId: string };
    const orgId = request.headers['x-org-id'] as string;

    if (!orgId) {
      reply.code(400);
      return { error: 'Missing required header: x-org-id' };
    }

    const body = statusUpdateSchema.parse(request.body);

    const result = await updateMessageStatus(messageId, orgId, {
      status: body.status,
      reason: (body.reason as any) || 'admin',
      changedBy: body.changedBy || request.user?.id || 'admin',
      metadata: body.metadata
    });

    return {
      success: true,
      data: result
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[StatusTracking] Error updating message status:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to update message status',
      details: error.message
    });
  }
}

/**
 * GET /admin/messages/:messageId/history
 * Get status history for a specific message
 */
export async function getMessageStatusHistoryHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { messageId } = request.params as { messageId: string };
    const orgId = request.headers['x-org-id'] as string;

    if (!orgId) {
      reply.code(400);
      return { error: 'Missing required header: x-org-id' };
    }

    const query = historyQuerySchema.parse(request.query);

    const history = await getStatusHistory(messageId, orgId, {
      limit: query.limit,
      offset: query.offset,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
      status: query.status,
      reason: query.reason
    });

    return {
      success: true,
      data: {
        messageId,
        history,
        count: history.length
      }
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[StatusTracking] Error fetching status history:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch status history',
      details: error.message
    });
  }
}

/**
 * GET /admin/status/metrics
 * Get status distribution and transition metrics
 */
export async function getStatusMetricsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const orgId = request.headers['x-org-id'] as string;

    if (!orgId) {
      reply.code(400);
      return { error: 'Missing required header: x-org-id' };
    }

    const metrics = await getStatusMetrics(orgId);

    return {
      success: true,
      data: metrics
    };
  } catch (error: any) {
    console.error('[StatusTracking] Error fetching status metrics:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch status metrics',
      details: error.message
    });
  }
}

/**
 * GET /admin/status/transitions
 * Get status transition statistics (who changed what)
 */
export async function getStatusTransitionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const orgId = request.headers['x-org-id'] as string;
    const { limit = 50, messageId } = request.query as any;

    if (!orgId) {
      reply.code(400);
      return { error: 'Missing required header: x-org-id' };
    }

    // Query recent status history entries
    const where: any = {
      message: { orgId }
    };

    if (messageId) {
      where.messageId = messageId;
    }

    const entries = await prisma.messageStatusHistory.findMany({
      where,
      orderBy: { changedAt: 'desc' },
      take: limit,
      include: {
        message: {
          select: {
            id: true,
            orgId: true,
            instanceId: true,
            chatId: true
          }
        }
      }
    });

    // Group by transition
    const transitions: Record<string, number> = {};
    for (let i = 0; i < entries.length - 1; i++) {
      const current = entries[i];
      const previous = entries[i + 1];
      const key = `${previous.status}->${current.status}`;
      transitions[key] = (transitions[key] || 0) + 1;
    }

    return {
      success: true,
      data: {
        total: entries.length,
        transitions,
        recentEntries: entries.map(e => ({
          id: e.id,
          messageId: e.messageId,
          status: e.status,
          changedAt: e.changedAt,
          changedBy: e.changedBy,
          reason: e.reason
        }))
      }
    };
  } catch (error: any) {
    console.error('[StatusTracking] Error fetching transitions:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch transition data',
      details: error.message
    });
  }
}

// ============================================================================
// Fastify Route Registration
// ============================================================================

export async function registerStatusTrackingRoutes(fastify: any) {
  // Message status management
  fastify.post('/admin/messages/:messageId/status', updateMessageStatusHandler);
  fastify.get('/admin/messages/:messageId/history', getMessageStatusHistoryHandler);

  // Metrics and analytics
  fastify.get('/admin/status/metrics', getStatusMetricsHandler);
  fastify.get('/admin/status/transitions', getStatusTransitionsHandler);

  console.log('[StatusTracking] Registered status tracking admin routes under /admin/messages and /admin/status');
}

export default registerStatusTrackingRoutes;

// Import prisma for the transitions handler
import { prisma } from '../../../lib/prisma';
