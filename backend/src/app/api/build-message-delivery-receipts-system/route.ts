/**
 * Message Delivery Receipts API Routes
 * Exposes endpoints for querying message delivery status and metrics
 *
 * Base path: / (mounted directly)
 * Endpoints:
 * - GET    /receipts/:messageId          - Get delivery receipt for a specific message
 * - GET    /receipts                     - Query receipts with filters
 * - GET    /receipts/chat/:chatId        - Get receipts for a chat
 * - GET    /receipts/metrics             - Get delivery metrics
 * - GET    /receipts/pending/:instanceId - Get pending message count
 * - GET    /health                       - Health check
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as receiptLib from '../../../lib/build-message-delivery-receipts-system';
import { MessageStatus } from '@prisma/client';
import { ReceiptQuery } from '../../../lib/build-message-delivery-receipts-system/types';

// ============================================================================
// Zod Schemas
// ============================================================================

const messageIdSchema = z.object({
  messageId: z.string().min(1)
});

const chatIdSchema = z.object({
  chatId: z.string().min(1)
});

const querySchema = z.object({
  orgId: z.string().min(1),
  instanceId: z.string().optional(),
  chatId: z.string().optional(),
  status: z.nativeEnum(MessageStatus).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.number().int().positive().optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0)
});

const metricsSchema = z.object({
  orgId: z.string().min(1),
  instanceId: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional()
});

// ============================================================================
// Plugin Registration
// ============================================================================

export default async function (fastify: FastifyInstance) {
  // ------------------------------------------------------------------------
  // GET /receipts/:messageId - Get delivery receipt for a specific message
  // ------------------------------------------------------------------------
  fastify.get(
    '/receipts/:messageId',
    { schema: { params: z.object({ messageId: z.string() }) } },
    async (request: FastifyRequest<{ Params: { messageId: string } }>, reply: FastifyReply) => {
      const { messageId } = request.params;
      const orgId = request.headers['x-org-id'] as string;

      if (!orgId) {
        reply.code(400);
        return { error: 'Missing required header: x-org-id' };
      }

      try {
        const receipt = await receiptLib.getReceipt(messageId, orgId);
        return { receipt };
      } catch (error: any) {
        if (error.message.includes('not found')) {
          reply.code(404);
          return { error: `Message ${messageId} not found` };
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /receipts - Query receipts with filters
  // ------------------------------------------------------------------------
  fastify.get(
    '/receipts',
    { schema: { querystring: querySchema } },
    async (request: FastifyRequest<{ Querystring: ReceiptQuery }>, reply: FastifyReply) => {
      const query = request.query as ReceiptQuery;

      // Validate orgId header matches querystring orgId (if provided)
      const headerOrgId = request.headers['x-org-id'] as string;
      if (headerOrgId && headerOrgId !== query.orgId) {
        reply.code(403);
        return { error: 'Organization mismatch' };
      }

      try {
        const result = await receiptLib.queryReceipts(query);
        return {
          receipts: result.receipts,
          total: result.total,
          hasMore: result.hasMore,
          limit: query.limit,
          offset: query.offset
        };
      } catch (error: any) {
        console.error('Error querying receipts:', error);
        reply.code(500);
        return { error: 'Failed to query receipts' };
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /receipts/chat/:chatId - Get receipts for a chat
  // ------------------------------------------------------------------------
  fastify.get(
    '/receipts/chat/:chatId',
    { schema: { params: z.object({ chatId: z.string() }) } },
    async (request: FastifyRequest<{ Params: { chatId: string }; Querystring: { limit?: number } }>, reply: FastifyReply) => {
      const { chatId } = request.params;
      const orgId = request.headers['x-org-id'] as string;

      if (!orgId) {
        reply.code(400);
        return { error: 'Missing required header: x-org-id' };
      }

      const limit = Math.min(Number(request.query.limit) || 50, 100); // Cap at 100

      try {
        const receipts = await receiptLib.getChatReceipts(chatId, orgId, limit);
        return {
          receipts,
          count: receipts.length
        };
      } catch (error: any) {
        console.error('Error getting chat receipts:', error);
        reply.code(500);
        return { error: 'Failed to get chat receipts' };
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /receipts/metrics - Get delivery metrics
  // ------------------------------------------------------------------------
  fastify.get(
    '/receipts/metrics',
    { schema: { querystring: metricsSchema } },
    async (request: FastifyRequest<{ Querystring: { orgId: string; instanceId?: string; fromDate?: string; toDate?: string } }>, reply: FastifyReply) => {
      const { orgId, instanceId, fromDate, toDate } = request.query;

      // Validate orgId header
      const headerOrgId = request.headers['x-org-id'] as string;
      if (headerOrgId && headerOrgId !== orgId) {
        reply.code(403);
        return { error: 'Organization mismatch' };
      }

      // Parse dates if provided
      const parsedFromDate = fromDate ? new Date(fromDate) : undefined;
      const parsedToDate = toDate ? new Date(toDate) : undefined;

      try {
        const metrics = await receiptLib.getDeliveryMetrics({
          orgId,
          instanceId,
          fromDate: parsedFromDate,
          toDate: parsedToDate
        });

        return { metrics };
      } catch (error: any) {
        console.error('Error getting delivery metrics:', error);
        reply.code(500);
        return { error: 'Failed to get delivery metrics' };
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /receipts/pending/:instanceId - Get pending message count
  // ------------------------------------------------------------------------
  fastify.get(
    '/receipts/pending/:instanceId',
    { schema: { params: z.object({ instanceId: z.string() }) } },
    async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
      const { instanceId } = request.params;
      const orgId = request.headers['x-org-id'] as string;

      if (!orgId) {
        reply.code(400);
        return { error: 'Missing required header: x-org-id' };
      }

      try {
        const pendingCount = await receiptLib.getPendingCount(instanceId, orgId);
        return {
          instanceId,
          pendingCount,
          timestamp: new Date().toISOString()
        };
      } catch (error: any) {
        console.error('Error getting pending count:', error);
        reply.code(500);
        return { error: 'Failed to get pending count' };
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /health - Health check
  // ------------------------------------------------------------------------
  fastify.get('/health', async (request, reply) => {
    // Simple health check - if we can query, we're healthy
    try {
      const orgId = request.headers['x-org-id'] as string || 'system-check';
      const pending = await receiptLib.getPendingCount('health-check', orgId);
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        pendingCheck: 'ok'
      };
    } catch (error) {
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        error: 'Unable to query receipts'
      };
    }
  });
}
