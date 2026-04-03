/**
 * GET /admin/dlq/metrics
 * Get DLQ statistics and metrics
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { getDlqMetrics } from '../../../../lib/message-retry-and-dlq-system/dlq';

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
