/**
 * POST /admin/dlq/messages/retry-all
 * Re-queue multiple DLQ entries (optionally filtered) back to the main queue
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { dlqReplaySchema } from '../schemas';
import {
  listDlqEntries,
  getAllDlqStreamKeys,
  requeueFromDlq,
  getDlqStreamKey
} from '../../../../lib/message-retry-and-dlq-system/dlq';
import { messageQueue } from '../../../../lib/message-queue-priority-system';

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
