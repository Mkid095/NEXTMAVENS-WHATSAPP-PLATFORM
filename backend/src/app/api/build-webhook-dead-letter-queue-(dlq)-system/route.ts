/**
 * Webhook Dead Letter Queue (DLQ) Admin API
 *
 * Endpoints for monitoring and managing dead letters.
 * Protected by auth + orgGuard middleware (SUPER_ADMIN only effectively).
 */

import { z, ZodError } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  getDeadLetters,
  getDeadLetter as getDLQ,
  retryDeadLetter,
  deleteDeadLetter,
  cleanOldDeadLetters,
} from '../../../lib/build-webhook-dead-letter-queue-system';

// ============================================================================
// Validation Schemas
// ============================================================================

const cleanSchema = z.object({
  olderThanDays: z.number().int().positive().optional(),
});

const querySchema = z.object({
  page: z.preprocess((val) => Number(val), z.number().int().positive().optional()),
  limit: z.preprocess((val) => Number(val), z.number().int().positive().optional()),
  orgId: z.string().optional(),
  instanceId: z.string().optional(),
  event: z.string().optional(),
});

// ============================================================================
// Route Handlers
// ============================================================================

export async function listDeadLettersHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { page = 1, limit = 50, orgId, instanceId, event } = querySchema.parse(request.query);

    const result = await getDeadLetters(
      { orgId, instanceId, event },
      page,
      limit
    );

    return { success: true, data: result };
  } catch (error: any) {
    if (error instanceof ZodError) {
      return reply.code(400).send({ success: false, error: 'Invalid query parameters', details: error.format() });
    }
    console.error('[DLQAdmin] Error listing dead letters:', error);
    return reply.code(500).send({ success: false, error: 'Failed to list dead letters' });
  }
}

export async function getDeadLetterHandler(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const dl = await getDLQ(id);

    if (!dl) {
      return reply.code(404).send({ success: false, error: 'Dead letter not found' });
    }

    return { success: true, data: dl };
  } catch (error: any) {
    console.error('[DLQAdmin] Error fetching dead letter:', error);
    return reply.code(500).send({ success: false, error: 'Failed to fetch dead letter' });
  }
}

export async function retryDeadLetterHandler(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    // orgId should be derived from request.user (set by auth middleware)
    const orgId = (request.user as any)?.orgId;
    if (!orgId) {
      return reply.code(400).send({ success: false, error: 'User organization not identified' });
    }

    const result = await retryDeadLetter(id, orgId);

    if (!result.success) {
      const statusCode = result.error?.includes('not found') ? 404 : 500;
      return reply.code(statusCode).send({ success: false, error: result.error });
    }

    return { success: true, data: { messageId: result.messageId } };
  } catch (error: any) {
    console.error('[DLQAdmin] Error retrying dead letter:', error);
    return reply.code(500).send({ success: false, error: 'Failed to retry dead letter' });
  }
}

export async function deleteDeadLetterHandler(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const orgId = (request.user as any)?.orgId;
    if (!orgId) {
      return reply.code(400).send({ success: false, error: 'User organization not identified' });
    }

    const deleted = await deleteDeadLetter(id, orgId);

    if (!deleted) {
      return reply.code(404).send({ success: false, error: 'Dead letter not found or access denied' });
    }

    return { success: true, data: { deleted: true } };
  } catch (error: any) {
    console.error('[DLQAdmin] Error deleting dead letter:', error);
    return reply.code(500).send({ success: false, error: 'Failed to delete dead letter' });
  }
}

export async function cleanDeadLettersHandler(request: FastifyRequest<{ Body: z.infer<typeof cleanSchema> }>, reply: FastifyReply) {
  try {
    const { olderThanDays = 7 } = request.body;
    const deletedCount = await cleanOldDeadLetters(olderThanDays);

    return {
      success: true,
      data: {
        deletedCount,
        olderThanDays,
      },
    };
  } catch (error: any) {
    console.error('[DLQAdmin] Error cleaning dead letters:', error);
    return reply.code(500).send({ success: false, error: 'Failed to clean dead letters' });
  }
}

// ============================================================================
// Fastify Route Registration
// ============================================================================

export async function registerDeadLetterQueueAdminRoutes(fastify: any) {
  fastify.get('/admin/dlq', { schema: { query: querySchema, hide: true } }, listDeadLettersHandler);
  fastify.get('/admin/dlq/:id', { schema: { hide: true } }, getDeadLetterHandler);
  fastify.post('/admin/dlq/:id/retry', { schema: { hide: true } }, retryDeadLetterHandler);
  fastify.delete('/admin/dlq/:id', { schema: { hide: true } }, deleteDeadLetterHandler);
  fastify.post('/admin/dlq/clean', { schema: { body: cleanSchema, hide: true } }, cleanDeadLettersHandler);

  console.log('[DLQAdmin] Registered dead letter queue admin routes under /admin/dlq');
}