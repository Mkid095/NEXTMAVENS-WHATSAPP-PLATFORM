/**
 * DELETE /admin/workflows/:id
 * Soft delete workflow definition (set isActive=false)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { updateWorkflowDefinition } from '../../../../lib/workflow-orchestration';

export async function deleteWorkflowHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };

    const definition = await updateWorkflowDefinition(id, { isActive: false });

    return {
      success: true,
      data: { id: definition.id, isActive: false }
    };
  } catch (error: any) {
    console.error('[WorkflowAPI] Error deleting workflow:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to delete workflow definition'
    });
  }
}
