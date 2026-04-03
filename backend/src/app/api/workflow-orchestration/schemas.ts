/**
 * Workflow Orchestration Validation Schemas
 *
 * Zod schemas for validating workflow API requests.
 */

import { z } from 'zod';

/**
 * Workflow definition creation/update
 * Used by: createWorkflowHandler, updateWorkflowHandler
 */
export const workflowDefinitionSchema = z.object({
  workflowId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  steps: z.array(z.object({
    id: z.string(),
    type: z.string(),
    action: z.string(),
    params: z.record(z.string(), z.any()).optional(),
    next: z.array(z.string()).optional(),
  })),
  compensation: z.array(z.object({
    stepId: z.string(),
    action: z.string(),
    params: z.record(z.string(), z.any()).optional(),
  })).optional(),
  timeoutMs: z.number().int().positive().optional(),
  retryPolicy: z.object({
    maxRetries: z.number().int().nonnegative().default(3),
    backoffMs: z.number().int().positive().optional(),
  }).optional(),
});

/**
 * Starting a workflow instance
 * Used by: startWorkflowInstanceHandler
 */
export const startWorkflowSchema = z.object({
  definitionId: z.string().min(1),
  context: z.record(z.string(), z.any()).optional(),
});

/**
 * Cancelling a workflow instance
 * Used by: cancelWorkflowInstanceHandler
 */
export const cancelWorkflowSchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * Query parameters for listing workflow definitions
 * Used by: listWorkflowsHandler
 */
export const listDefinitionsQuerySchema = z.object({
  isActive: z.boolean().optional(),
  search: z.string().max(100).optional(),
});

/**
 * Query parameters for listing workflow instances
 * Used by: listWorkflowInstancesHandler
 */
export const listInstancesQuerySchema = z.object({
  workflowId: z.string().optional(),
  status: z.string().optional(),
  orgId: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});
