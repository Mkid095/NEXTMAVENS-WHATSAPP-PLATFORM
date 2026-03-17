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
  fromDate: z.date().optional(),
  toDate: z.date().optional(),
  limit: z.number().int().positive().optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0)
});

const metricsSchema = z.object({
  orgId: z.string().min(1),
  instanceId: z.string().optional(),
  fromDate: z.date().optional(),
  toDate: z.date().optional()
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = z.object({ messageId: z.string() }).parse(request.params);
        const { messageId } = params;
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
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = querySchema.parse(request.query);
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
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /receipts/chat/:chatId - Get receipts for a chat
  // ------------------------------------------------------------------------
  fastify.get(
    '/receipts/chat/:chatId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = z.object({ chatId: z.string() }).parse(request.params);
        const { chatId } = params;
        const orgId = request.headers['x-org-id'] as string;

        if (!orgId) {
          reply.code(400);
          return { error: 'Missing required header: x-org-id' };
        }

        const limit = Math.min(Number((request.query as any)?.limit) || 50, 100); // Cap at 100

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
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /receipts/metrics - Get delivery metrics
  // ------------------------------------------------------------------------
  fastify.get(
    '/receipts/metrics',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = metricsSchema.parse(request.query);
        const { orgId, instanceId, fromDate, toDate } = query;

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
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /receipts/pending/:instanceId - Get pending message count
  // ------------------------------------------------------------------------
  fastify.get(
    '/receipts/pending/:instanceId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = z.object({ instanceId: z.string() }).parse(request.params);
        const { instanceId } = params;
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
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );
}
