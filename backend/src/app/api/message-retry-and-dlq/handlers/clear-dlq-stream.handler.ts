/**
 * DELETE /admin/dlq/streams/:messageType
 * Clear an entire DLQ stream (dangerous - no confirmation!)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { clearDlqStream, getDlqStreamKey } from '../../../../lib/message-retry-and-dlq-system/dlq';

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
