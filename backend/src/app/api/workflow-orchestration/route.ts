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

// ============================================================================
// Step Action Schemas (for validation)
// ============================================================================

const messageActionSchema = z.object({
  type: z.literal('message'),
  config: z.object({
    to: z.string().min(1),
    message: z.any(), // Can be string or complex object depending on messageType
    messageType: z.enum(['text', 'image', 'video', 'audio', 'document', 'template']).optional().default('text')
  }).required()
});

const apiCallActionSchema = z.object({
  type: z.literal('api-call'),
  config: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('POST'),
    headers: z.record(z.string(), z.string()).optional().default({}),
    body: z.any().optional()
  }).required()
});

const queueJobActionSchema = z.object({
  type: z.literal('queue-job'),
  config: z.object({
    jobType: z.enum(['MESSAGE_UPSERT', 'MESSAGE_STATUS_UPDATE', 'INSTANCE_STATUS_UPDATE', 'ANALYTICS_EVENT']),
    payload: z.record(z.string(), z.any())
  }).required()
});

const delayActionSchema = z.object({
  type: z.literal('delay'),
  config: z.object({
    delayMs: z.number().int().positive()
  }).required()
});

const customActionSchema = z.object({
  type: z.literal('custom'),
  config: z.object({
    handler: z.string().min(1),
    params: z.record(z.string(), z.any()).optional().default({})
  }).required()
});

const parallelActionSchema = z.object({
  type: z.literal('parallel'),
  config: z.object({
    // Parallel execution config (future implementation)
    maxConcurrent: z.number().int().positive().optional().default(5)
  }).required()
});

// Union of all valid action types
const actionSchema = z.discriminatedUnion('type', [
  messageActionSchema,
  apiCallActionSchema,
  queueJobActionSchema,
  delayActionSchema,
  customActionSchema,
  parallelActionSchema
]);

// Compensation action (used within steps and workflow-level compensation)
const compensationActionSchema = z.object({
  type: z.string().min(1), // Custom string, not limited to enum
  config: z.record(z.string(), z.any())
});

const stepCompensationSchema = z.object({
  type: z.enum(['reverse', 'custom']),
  action: compensationActionSchema
});

// Full step schema
const stepSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  action: actionSchema,
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  retryPolicy: z.object({
    maxAttempts: z.number().int().positive(),
    baseDelayMs: z.number().int().nonnegative(),
    maxDelayMs: z.number().int().positive(),
    jitterFactor: z.number().min(0).max(1)
  }).optional(),
  compensation: stepCompensationSchema.optional(),
  optional: z.boolean().optional(),
  condition: z.object({
    expression: z.string().min(1)
  }).optional()
});

// Workflow-level compensation schema
const compensationSchema = z.object({
  type: z.enum(['sequential', 'parallel']),
  steps: z.array(stepSchema).min(1)
});

// Retry policy schema (workflow level default)
const retryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  baseDelayMs: z.number().int().nonnegative(),
  maxDelayMs: z.number().int().positive(),
  jitterFactor: z.number().min(0).max(1)
});

// Complete workflow definition schema
const workflowDefinitionSchema = z.object({
  workflowId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  steps: z.array(stepSchema).min(1),
  compensation: compensationSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  retryPolicy: retryPolicySchema.optional(),
  // Note: isActive and createdBy are set by the system, not user-provided
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

    // Ensure user is authenticated (auth middleware should have set request.user)
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
      error: 'Failed to start workflow instance',
      details: error.message, // Include error for debugging
      stack: error.stack
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
  // Workflow definitions (prefix /admin/workflows will be added by server registration)
  fastify.post('/', createWorkflowHandler);
  fastify.get('/', listWorkflowsHandler);
  fastify.get('/:id', getWorkflowHandler);
  fastify.put('/:id', updateWorkflowHandler);
  fastify.delete('/:id', deleteWorkflowHandler);

  // Workflow instances
  fastify.post('/instances', startWorkflowInstanceHandler);
  fastify.get('/instances', listWorkflowInstancesHandler);
  fastify.get('/instances/:instanceId', getWorkflowInstanceHandler);
  fastify.post('/instances/:instanceId/cancel', cancelWorkflowInstanceHandler);
  fastify.get('/instances/:instanceId/health', getWorkflowInstanceHealthHandler);

  console.log('[WorkflowAPI] Registered workflow orchestration admin routes under /admin/workflows');
}

export default registerWorkflowRoutes;
