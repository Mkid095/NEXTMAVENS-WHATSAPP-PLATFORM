/**
 * Dead Letter Queue (DLQ) Admin API
 *
 * Endpoints for monitoring, managing, and replaying failed messages.
 * Protected by auth + orgGuard middleware (SUPER_ADMIN only effectively).
 *
 * Base path: /admin/dlq
 */

import { z, ZodError } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  listDlqEntries,
  getDlqEntry,
  getDlqMetrics,
  deleteDlqEntry,
  deleteDlqEntries,
  requeueFromDlq,
  clearDlqStream,
  getAllDlqStreamKeys,
  getDlqStreamKey
} from '../../../lib/message-retry-and-dlq-system/dlq';
import { messageQueue } from '../../../lib/message-queue-priority-system';
import { ErrorCategory } from '../../../lib/message-retry-and-dlq-system/types';

// ============================================================================
// Validation Schemas
// ============================================================================

const dlqQuerySchema = z.object({
  messageType: z.string().optional(),
  errorCategory: z.enum([ErrorCategory.TRANSIENT, ErrorCategory.PERMANENT, ErrorCategory.UNKNOWN]).optional(),
  minRetries: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.string().optional(),
  newestFirst: z.boolean().default(true)
});

const dlqReplaySchema = z.object({
  messageType: z.string().optional(),
  errorCategory: z.enum([ErrorCategory.TRANSIENT, ErrorCategory.PERMANENT, ErrorCategory.UNKNOWN]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  dryRun: z.boolean().default(false)
});

const dlqBulkDeleteSchema = z.object({
  messageType: z.string().optional(),
  errorCategory: z.enum([ErrorCategory.TRANSIENT, ErrorCategory.PERMANENT, ErrorCategory.UNKNOWN]).optional(),
  olderThanDays: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional()
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /admin/dlq/metrics
 * Get DLQ statistics and metrics
 */
export async function getDlqMetricsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const metrics = await getDlqMetrics();

    return {
      success: true,
      data: metrics
    };
  } catch (error: any) {
    console.error('[DLQAdmin] Error fetching DLQ metrics:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch DLQ metrics',
      details: error.message
    });
  }
}

/**
 * GET /admin/dlq/messages
 * List failed messages from DLQ with pagination and filtering
 */
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

/**
 * GET /admin/dlq/messages/:entryId
 * Get details of a specific DLQ entry
 */
export async function getDlqMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { entryId } = request.params as { entryId: string };
    const { messageType } = request.query as { messageType?: string };

    if (!messageType) {
      reply.code(400).send({
        error: 'Bad Request',
        message: 'messageType query parameter is required'
      });
      return;
    }

    const streamKey = getDlqStreamKey(messageType);
    const entry = await getDlqEntry(streamKey, entryId);

    if (!entry) {
      reply.code(404).send({
        error: 'Not Found',
        message: `DLQ entry ${entryId} not found in stream ${streamKey}`
      });
      return;
    }

    return {
      success: true,
      data: {
        id: entry.id,
        ...entry.data
      }
    };
  } catch (error: any) {
    console.error('[DLQAdmin] Error fetching DLQ message:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch DLQ message',
      details: error.message
    });
  }
}

/**
 * POST /admin/dlq/messages/:entryId/retry
 * Re-queue a specific DLQ entry back to the main queue
 */
export async function retryDlqMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { entryId } = request.params as { entryId: string };
    const { messageType } = request.query as { messageType?: string };

    if (!messageType) {
      reply.code(400).send({
        error: 'Bad Request',
        message: 'messageType query parameter is required'
      });
      return;
    }

    const streamKey = getDlqStreamKey(messageType);
    const success = await requeueFromDlq(streamKey, entryId, messageQueue);

    if (!success) {
      reply.code(404).send({
        error: 'Not Found',
        message: `DLQ entry ${entryId} not found or could not be re-queued`
      });
      return;
    }

    return {
      success: true,
      data: {
        requeued: true,
        entryId,
        messageType
      }
    };
  } catch (error: any) {
    console.error('[DLQAdmin] Error retrying DLQ message:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to retry DLQ message',
      details: error.message
    });
  }
}

/**
 * POST /admin/dlq/messages/retry-all
 * Re-queue multiple DLQ entries (optionally filtered) back to the main queue
 */
export async function retryAllDlqMessagesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = dlqReplaySchema.parse(request.body);
    const { messageType, errorCategory, limit, dryRun } = body;

    // Get all stream keys to query
    const streamKeys = messageType
      ? [getDlqStreamKey(messageType)]
      : await getAllDlqStreamKeys();

    let totalRetried = 0;
    let errors: string[] = [];

    for (const streamKey of streamKeys) {
      try {
        // List entries with filter
        const { entries } = await listDlqEntries({
          messageType: streamKey.split(':').pop(),
          errorCategory,
          limit: limit || 100,
          newestFirst: true
        });

        if (dryRun) {
          // Just count what would be retried
          totalRetried += entries.length;
          continue;
        }

        // Re-queue each entry
        for (const entry of entries) {
          try {
            const success = await requeueFromDlq(streamKey, entry.id, messageQueue);
            if (!success) {
              errors.push(`Failed to re-queue entry ${entry.id} from ${streamKey}`);
            } else {
              totalRetried++;
            }
          } catch (e: any) {
            errors.push(`Error re-queuing entry ${entry.id}: ${e.message}`);
          }
        }
      } catch (e: any) {
        errors.push(`Error processing stream ${streamKey}: ${e.message}`);
      }
    }

    if (dryRun) {
      return {
        success: true,
        data: {
          dryRun: true,
          wouldRetry: totalRetried,
          streamsProcessed: streamKeys.length
        }
      };
    }

    return {
      success: true,
      data: {
        retried: totalRetried,
        streamsProcessed: streamKeys.length,
        errors: errors.length > 0 ? errors : undefined
      }
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[DLQAdmin] Error retrying all DLQ messages:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to retry all DLQ messages',
      details: error.message
    });
  }
}

/**
 * DELETE /admin/dlq/messages/:entryId
 * Permanently delete a specific DLQ entry
 */
export async function deleteDlqMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { entryId } = request.params as { entryId: string };
    const { messageType } = request.query as { messageType?: string };

    if (!messageType) {
      reply.code(400).send({
        error: 'Bad Request',
        message: 'messageType query parameter is required'
      });
      return;
    }

    const streamKey = getDlqStreamKey(messageType);
    const deleted = await deleteDlqEntry(streamKey, entryId);

    if (!deleted) {
      reply.code(404).send({
        error: 'Not Found',
        message: `DLQ entry ${entryId} not found in stream ${streamKey}`
      });
      return;
    }

    return {
      success: true,
      data: {
        deleted: true,
        entryId,
        messageType
      }
    };
  } catch (error: any) {
    console.error('[DLQAdmin] Error deleting DLQ message:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to delete DLQ message',
      details: error.message
    });
  }
}

/**
 * DELETE /admin/dlq/messages
 * Bulk delete DLQ entries with filters
 */
export async function bulkDeleteDlqMessagesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = dlqBulkDeleteSchema.parse(request.body);
    const { messageType, errorCategory, olderThanDays, limit } = body;

    // Get all stream keys to query
    const streamKeys = messageType
      ? [getDlqStreamKey(messageType)]
      : await getAllDlqStreamKeys();

    let totalDeleted = 0;
    let errors: string[] = [];

    for (const streamKey of streamKeys) {
      try {
        // List entries with filter
        const { entries } = await listDlqEntries({
          messageType: streamKey.split(':').pop(),
          errorCategory,
          limit: limit || 100,
          newestFirst: false // Get oldest first for bulk delete
        });

        if (entries.length === 0) continue;

        // Collect entry IDs
        const entryIds = entries.map(e => e.id);

        // Delete entries
        const deletedCount = await deleteDlqEntries(streamKey, entryIds);
        totalDeleted += deletedCount;
      } catch (e: any) {
        errors.push(`Error deleting from stream ${streamKey}: ${e.message}`);
      }
    }

    return {
      success: true,
      data: {
        deleted: totalDeleted,
        streamsProcessed: streamKeys.length,
        errors: errors.length > 0 ? errors : undefined
      }
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[DLQAdmin] Error bulk deleting DLQ messages:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to bulk delete DLQ messages',
      details: error.message
    });
  }
}

/**
 * GET /admin/dlq/streams
 * List all DLQ streams (grouped by message type)
 */
export async function listDlqStreamsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const streamKeys = await getAllDlqStreamKeys();

    // Group by message type and get counts
    const streams = await Promise.all(
      streamKeys.map(async (key) => {
        const { getRedisClient } = await import('../../../lib/message-retry-and-dlq-system/dlq');
        const client = await getRedisClient();
        const count = await client.xlen(key);
        const parts = key.split(':');
        const messageType = parts[parts.length - 1];
        return {
          messageType,
          streamKey: key,
          count
        };
      })
    );

    return {
      success: true,
      data: streams.sort((a, b) => b.count - a.count)
    };
  } catch (error: any) {
    console.error('[DLQAdmin] Error listing DLQ streams:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to list DLQ streams',
      details: error.message
    });
  }
}

/**
 * DELETE /admin/dlq/streams/:messageType
 * Clear an entire DLQ stream (dangerous - no confirmation!)
 */
export async function clearDlqStreamHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { messageType } = request.params as { messageType: string };
    const streamKey = getDlqStreamKey(messageType);

    const deletedCount = await clearDlqStream(streamKey);

    return {
      success: true,
      data: {
        cleared: true,
        messageType,
        streamKey,
        deletedCount
      }
    };
  } catch (error: any) {
    console.error('[DLQAdmin] Error clearing DLQ stream:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to clear DLQ stream',
      details: error.message
    });
  }
}

// ============================================================================
// Fastify Route Registration
// ============================================================================

export async function registerDlqAdminRoutes(fastify: any) {
  // Metrics
  fastify.get('/admin/dlq/metrics', getDlqMetricsHandler);

  // Message management
  fastify.get('/admin/dlq/messages', listDlqMessagesHandler);
  fastify.get('/admin/dlq/messages/:entryId', getDlqMessageHandler);
  fastify.post('/admin/dlq/messages/:entryId/retry', retryDlqMessageHandler);
  fastify.delete('/admin/dlq/messages/:entryId', deleteDlqMessageHandler);
  fastify.post('/admin/dlq/messages/retry-all', retryAllDlqMessagesHandler);
  fastify.delete('/admin/dlq/messages', bulkDeleteDlqMessagesHandler);

  // Stream management
  fastify.get('/admin/dlq/streams', listDlqStreamsHandler);
  fastify.delete('/admin/dlq/streams/:messageType', clearDlqStreamHandler);

  console.log('[DLQAdmin] Registered DLQ admin routes under /admin/dlq');
}

export default registerDlqAdminRoutes;
