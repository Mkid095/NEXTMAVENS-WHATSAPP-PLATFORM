/**
 * Workflow Schemas
 *
 * Zod schemas for workflow definitions, instances, and queries.
 */

import { z } from 'zod';
import { stepSchema, compensationSchema } from './compensation.schemas';

/**
 * Retry policy schema (workflow level default)
 */
export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  baseDelayMs: z.number().int().nonnegative(),
  maxDelayMs: z.number().int().positive(),
  jitterFactor: z.number().min(0).max(1)
});

/**
 * Complete workflow definition schema
 */
export const workflowDefinitionSchema = z.object({
  workflowId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  steps: z.array(stepSchema).min(1),
  compensation: compensationSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  retryPolicy: retryPolicySchema.optional()
});

/**
 * Start workflow schema
 */
export const startWorkflowSchema = z.object({
  definitionId: z.string().min(1),
  context: z.any().optional()
});

/**
 * List workflow definitions query schema
 */
export const listDefinitionsQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional(),
  search: z.string().optional()
});

/**
 * List workflow instances query schema
 */
export const listInstancesQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.string().optional(),
  definitionId: z.string().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'COMPENSATING', 'COMPENSATED']).optional(),
  orgId: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional()
});

/**
 * Cancel workflow schema
 */
export const cancelWorkflowSchema = z.object({
  reason: z.string().optional()
});
