/**
 * GET /admin/workflows/instances/:instanceId
 * Get workflow instance details
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { getWorkflowStatus } from '../../../../lib/workflow-orchestration';

export async function getWorkflowInstanceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { instanceId } = request.params as { instanceId: string };
    const orgId = request.headers['x-org-id'] as string;

    if (!orgId) {
      reply.code(400);
      return { success: false, error: 'Missing required header: x-org-id' };
    }

    const status = await getWorkflowStatus(instanceId);
    if (!status) {
      reply.code(404);
      return { success: false, error: 'Workflow instance not found' };
    }

    if (status.orgId !== orgId) {
      reply.code(403);
      return { success: false, error: 'Access denied' };
    }

    return {
      success: true,
      data: status
    };
  } catch (error: any) {
    console.error('[WorkflowAPI] Error fetching instance:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch workflow instance'
    });
  }
}
