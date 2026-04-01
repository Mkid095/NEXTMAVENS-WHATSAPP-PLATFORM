/**
 * PUT /admin/workflows/:id
 * Update workflow definition
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { workflowDefinitionSchema } from '../schemas';
import { updateWorkflowDefinition } from '../../../lib/workflow-orchestration';

export async function updateWorkflowHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const body = workflowDefinitionSchema.partial().parse(request.body);

    const { workflowId: __, ...updates } = body;

    const updateData: any = { ...updates, updatedAt: new Date() };
    if (updates.steps) updateData.stepsJson = updates.steps;
    if (updates.compensation) updateData.compensationJson = updates.compensation;
    if (updates.retryPolicy) updateData.retryPolicyJson = updates.retryPolicy;

    const definition = await updateWorkflowDefinition(id, updateData);

    return {
      success: true,
      data: {
        id: definition.id,
        workflowId: definition.workflowId,
        name: definition.name,
        version: definition.version,
        updatedAt: definition.updatedAt
      }
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[WorkflowAPI] Error updating workflow:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to update workflow definition'
    });
  }
}
