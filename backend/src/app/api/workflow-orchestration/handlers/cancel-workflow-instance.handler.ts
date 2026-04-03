/**
 * POST /admin/workflows/instances/:instanceId/cancel
 * Cancel a running workflow instance
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { cancelWorkflowSchema } from '../schemas';
import { cancelWorkflow } from '../../../../lib/workflow-orchestration';

export async function cancelWorkflowInstanceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { instanceId } = request.params as { instanceId: string };
    const orgId = request.headers['x-org-id'] as string;

    if (!orgId) {
      reply.code(400);
      return { success: false, error: 'Missing required header: x-org-id' };
    }

    const body = cancelWorkflowSchema.parse(request.body);
    const result = await cancelWorkflow(instanceId, body.reason);

    if (!result.success) {
      reply.code(400);
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: { instanceId: result.instanceId, status: 'cancelled' }
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[WorkflowAPI] Error cancelling workflow:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to cancel workflow instance'
    });
  }
}
