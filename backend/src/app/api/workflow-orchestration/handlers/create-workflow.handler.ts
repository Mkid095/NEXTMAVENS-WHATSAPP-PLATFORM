/**
 * POST /admin/workflows
 * Create a new workflow definition
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { workflowDefinitionSchema } from '../schemas';
import {
  createWorkflowDefinition
} from '../../../../lib/workflow-orchestration';

export async function createWorkflowHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = workflowDefinitionSchema.parse(request.body);

    const userId = (request as any).user?.id;
    if (!userId) {
      reply.code(401);
      return { success: false, error: 'Authentication required' };
    }

    const definition = await createWorkflowDefinition(
      body.workflowId,
      body.name,
      body.steps,
      {
        description: body.description,
        compensation: body.compensation,
        timeoutMs: body.timeoutMs,
        retryPolicy: body.retryPolicy,
        createdBy: userId
      }
    );

    return {
      success: true,
      data: {
        id: definition.id,
        workflowId: definition.workflowId,
        name: definition.name,
        version: definition.version,
        isActive: definition.isActive,
        createdAt: definition.createdAt
      }
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[WorkflowAPI] Error creating workflow:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to create workflow definition',
      details: error.message
    });
  }
}
