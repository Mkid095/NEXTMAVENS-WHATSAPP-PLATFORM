/**
 * GET /admin/workflows/:id
 * Get workflow definition details
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { getWorkflowDefinition } from '../../../lib/workflow-orchestration';

export async function getWorkflowHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };

    const definition = await getWorkflowDefinition(id);
    if (!definition) {
      reply.code(404);
      return { success: false, error: 'Workflow definition not found' };
    }

    return {
      success: true,
      data: {
        id: definition.id,
        workflowId: definition.workflowId,
        name: definition.name,
        description: definition.description,
        version: definition.version,
        steps: definition.steps,
        compensation: definition.compensation,
        timeoutMs: definition.timeoutMs,
        retryPolicy: definition.retryPolicy,
        isActive: definition.isActive,
        createdBy: definition.createdBy,
        createdAt: definition.createdAt,
        updatedAt: definition.updatedAt
      }
    };
  } catch (error: any) {
    console.error('[WorkflowAPI] Error fetching workflow:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch workflow definition'
    });
  }
}
