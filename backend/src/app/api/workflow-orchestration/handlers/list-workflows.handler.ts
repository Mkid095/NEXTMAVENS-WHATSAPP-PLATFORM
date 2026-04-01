/**
 * GET /admin/workflows
 * List workflow definitions
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { listDefinitionsQuerySchema } from '../schemas';
import { listWorkflowDefinitions } from '../../../lib/workflow-orchestration';

export async function listWorkflowsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = listDefinitionsQuerySchema.parse(request.query);

    const definitions = await listWorkflowDefinitions({
      isActive: query.isActive,
      search: query.search
    });

    return {
      success: true,
      data: {
        definitions: definitions.map(def => ({
          id: def.id,
          workflowId: def.workflowId,
          name: def.name,
          description: def.description,
          version: def.version,
          isActive: def.isActive,
          stepCount: def.steps?.length ?? 0,
          createdAt: def.createdAt,
          updatedAt: def.updatedAt
        })),
        total: definitions.length
      }
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[WorkflowAPI] Error listing workflows:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to list workflow definitions'
    });
  }
}
