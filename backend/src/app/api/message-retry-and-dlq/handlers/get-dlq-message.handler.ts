/**
 * GET /admin/dlq/messages/:entryId
 * Get details of a specific DLQ entry
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { getDlqEntry, getDlqStreamKey } from '../../../lib/message-retry-and-dlq-system/dlq';

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
