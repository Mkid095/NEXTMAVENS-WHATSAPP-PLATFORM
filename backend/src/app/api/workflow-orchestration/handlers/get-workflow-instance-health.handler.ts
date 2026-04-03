/**
 * GET /admin/workflows/instances/:instanceId/health
 * Check health of a workflow instance
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { checkWorkflowHealth } from '../../../../lib/workflow-orchestration';

export async function getWorkflowInstanceHealthHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { instanceId } = request.params as { instanceId: string };
    const orgId = request.headers['x-org-id'] as string;

    if (!orgId) {
      reply.code(400);
      return { success: false, error: 'Missing required header: x-org-id' };
    }

    const timeoutMs = (request.query as any).timeoutMs
      ? parseInt((request.query as any).timeoutMs)
      : undefined;

    const health = await checkWorkflowHealth(instanceId, timeoutMs);

    return {
      success: true,
      data: health
    };
  } catch (error: any) {
    console.error('[WorkflowAPI] Error checking workflow health:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to check workflow health'
    });
  }
}
