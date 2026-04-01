/**
 * POST /admin/workflows/instances
 * Start a new workflow instance
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { startWorkflowSchema } from '../schemas';
import { startWorkflow } from '../../../lib/workflow-orchestration';

export async function startWorkflowInstanceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = startWorkflowSchema.parse(request.body);
    const orgId = request.headers['x-org-id'] as string;

    if (!orgId) {
      reply.code(400);
      return { success: false, error: 'Missing required header: x-org-id' };
    }

    const result = await startWorkflow(body.definitionId, orgId, {
      context: body.context
    });

    return {
      success: true,
      data: result
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[WorkflowAPI] Error starting workflow instance:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to start workflow instance',
      details: error.message,
      stack: error.stack
    });
  }
}
