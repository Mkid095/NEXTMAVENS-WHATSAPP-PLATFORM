/**
 * GET /admin/dlq/messages
 * List failed messages from DLQ with pagination and filtering
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { dlqQuerySchema } from '../schemas';
import { listDlqEntries } from '../../../../lib/message-retry-and-dlq-system/dlq';

export async function listDlqMessagesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = dlqQuerySchema.parse(request.query);

    const result = await listDlqEntries({
      messageType: query.messageType,
      errorCategory: query.errorCategory,
      minRetries: query.minRetries,
      limit: query.limit,
      offset: query.offset,
      newestFirst: query.newestFirst
    });

    return {
      success: true,
      data: {
        entries: result.entries.map(entry => ({
          id: entry.id,
          messageType: entry.data.messageType,
          error: entry.data.error,
          errorCategory: entry.data.errorCategory,
          retryCount: entry.data.retryCount,
          failedAt: entry.data.failedAt,
          payload: entry.data.payload
        })),
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset || result.nextOffset || null,
          hasMore: !!result.nextOffset
        }
      }
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[DLQAdmin] Error listing DLQ messages:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to list DLQ messages',
      details: error.message
    });
  }
}
