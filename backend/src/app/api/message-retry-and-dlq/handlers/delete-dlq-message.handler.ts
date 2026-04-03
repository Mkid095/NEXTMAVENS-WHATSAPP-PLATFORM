/**
 * DELETE /admin/dlq/messages/:entryId
 * Permanently delete a specific DLQ entry
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { deleteDlqEntry, getDlqStreamKey } from '../../../../lib/message-retry-and-dlq-system/dlq';

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
