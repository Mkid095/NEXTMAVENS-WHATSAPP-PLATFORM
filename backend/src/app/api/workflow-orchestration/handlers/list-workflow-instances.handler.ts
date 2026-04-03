/**
 * GET /admin/workflows/instances
 * List workflow instances
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { listInstancesQuerySchema } from '../schemas';
import { listWorkflowInstances } from '../../../../lib/workflow-orchestration';

export async function listWorkflowInstancesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = listInstancesQuerySchema.parse(request.query);
    const orgId = request.headers['x-org-id'] as string;

    const filters: any = { ...query };
    if (orgId && !query.orgId) {
      filters.orgId = orgId;
    }

    const result = await listWorkflowInstances(filters);

    return {
      success: true,
      data: {
        instances: result.instances.map(inst => ({
          id: inst.id,
          instanceId: inst.instanceId,
          status: inst.status,
          currentStep: inst.currentStep,
          startedAt: inst.startedAt,
          completedAt: inst.completedAt,
          failedAt: inst.failedAt,
          failureReason: inst.failureReason,
          orgId: inst.orgId,
          definition: inst.definition ? {
            id: inst.definition.id,
            workflowId: inst.definition.workflowId,
            name: inst.definition.name
          } : null
        })),
        total: result.total,
        nextOffset: result.nextOffset
      }
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[WorkflowAPI] Error listing instances:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to list workflow instances'
    });
  }
}
