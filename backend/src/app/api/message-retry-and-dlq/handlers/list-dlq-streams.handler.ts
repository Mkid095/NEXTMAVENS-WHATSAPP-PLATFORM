/**
 * GET /admin/dlq/streams
 * List all DLQ streams (grouped by message type)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAllDlqStreamKeys } from '../../../lib/message-retry-and-dlq-system/dlq';

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
