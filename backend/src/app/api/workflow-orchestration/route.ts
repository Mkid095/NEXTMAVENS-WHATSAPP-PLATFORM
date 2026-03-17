/**
 * Workflow Orchestration Admin API
 *
 * Endpoints for managing workflow definitions and instances
 * Protected by auth + orgGuard middleware (SUPER_ADMIN only effectively)
 *
 * Base path: /admin/workflows
 */

import { z, ZodError } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createWorkflowDefinition,
  updateWorkflowDefinition,
  getWorkflowDefinition,
  getWorkflowDefinitionByWorkflowId,
  listWorkflowDefinitions,
  startWorkflow,
  getWorkflowStatus,
  cancelWorkflow,
  listWorkflowInstances,
  checkWorkflowHealth
} from '../../../lib/workflow-orchestration';

// ============================================================================
// Validation Schemas
// ============================================================================

const workflowDefinitionSchema = z.object({
  workflowId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  steps: z.any(),
  compensation: z.object({
    type: z.enum(['sequential', 'parallel']),
    steps: z.array(z.object({
      name: z.string(),
      action: z.object({
        type: z.string(),
        config: z.any()
      })
    }))
  }).optional(),
  timeoutMs: z.number().int().positive().optional(),
  retryPolicy: z.object({
    maxAttempts: z.number().int().positive(),
    baseDelayMs: z.number().int().nonnegative(),
    maxDelayMs: z.number().int().positive(),
    jitterFactor: z.number().min(0).max(1)
  }).optional()
});

const startWorkflowSchema = z.object({
  definitionId: z.string().min(1),
  context: z.any().optional()
});

const listDefinitionsQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional(),
  search: z.string().optional()
});

const listInstancesQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.string().optional(),
  definitionId: z.string().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'COMPENSATING', 'COMPENSATED']).optional(),
  orgId: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional()
});

const cancelWorkflowSchema = z.object({
  reason: z.string().optional()
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /admin/workflows
 * Create a new workflow definition
 */
export async function createWorkflowHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = workflowDefinitionSchema.parse(request.body);
    const userId = request.user?.id;

    if (!userId) {
      reply.code(401);
      return { success: false, error: 'Unauthorized' };
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

/**
 * GET /admin/workflows
 * List workflow definitions
 */
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

/**
 * GET /admin/workflows/:id
 * Get workflow definition details
 */
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

/**
 * PUT /admin/workflows/:id
 * Update workflow definition
 */
export async function updateWorkflowHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const body = workflowDefinitionSchema.partial().parse(request.body);

    // Remove readonly fields (workflowId is also readonly but we ignore it)
    const { workflowId: __, ...updates } = body;

    // Prepare updates
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

/**
 * DELETE /admin/workflows/:id
 * Soft delete workflow definition (set isActive=false)
 */
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

/**
 * POST /admin/workflows/instances
 * Start a new workflow instance
 */
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
      error: 'Failed to start workflow instance'
    });
  }
}

/**
 * GET /admin/workflows/instances
 * List workflow instances
 */
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

/**
 * GET /admin/workflows/instances/:instanceId
 * Get workflow instance details
 */
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

    // Enforce org isolation
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

/**
 * POST /admin/workflows/instances/:instanceId/cancel
 * Cancel a running workflow instance
 */
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

/**
 * GET /admin/workflows/instances/:instanceId/health
 * Check health of a workflow instance
 */
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

// ============================================================================
// Route Registration
// ============================================================================

export async function registerWorkflowRoutes(fastify: any) {
  // Workflow definitions
  fastify.post('/admin/workflows', createWorkflowHandler);
  fastify.get('/admin/workflows', listWorkflowsHandler);
  fastify.get('/admin/workflows/:id', getWorkflowHandler);
  fastify.put('/admin/workflows/:id', updateWorkflowHandler);
  fastify.delete('/admin/workflows/:id', deleteWorkflowHandler);

  // Workflow instances
  fastify.post('/admin/workflows/instances', startWorkflowInstanceHandler);
  fastify.get('/admin/workflows/instances', listWorkflowInstancesHandler);
  fastify.get('/admin/workflows/instances/:instanceId', getWorkflowInstanceHandler);
  fastify.post('/admin/workflows/instances/:instanceId/cancel', cancelWorkflowInstanceHandler);
  fastify.get('/admin/workflows/instances/:instanceId/health', getWorkflowInstanceHealthHandler);

  console.log('[WorkflowAPI] Registered workflow orchestration admin routes under /admin/workflows');
}

export default registerWorkflowRoutes;
