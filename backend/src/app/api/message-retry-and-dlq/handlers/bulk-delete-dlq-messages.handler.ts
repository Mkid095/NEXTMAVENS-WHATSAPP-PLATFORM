/**
 * DELETE /admin/dlq/messages
 * Bulk delete DLQ entries with filters
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { dlqBulkDeleteSchema } from '../schemas';
import {
  listDlqEntries,
  getAllDlqStreamKeys,
  deleteDlqEntries,
  getDlqStreamKey
} from '../../../../lib/message-retry-and-dlq-system/dlq';

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
