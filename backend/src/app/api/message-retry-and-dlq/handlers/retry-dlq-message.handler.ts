/**
 * POST /admin/dlq/messages/:entryId/retry
 * Re-queue a specific DLQ entry back to the main queue
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { requeueFromDlq, getDlqStreamKey } from '../../../../lib/message-retry-and-dlq-system/dlq';
import { messageQueue } from '../../../../lib/message-queue-priority-system';

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
