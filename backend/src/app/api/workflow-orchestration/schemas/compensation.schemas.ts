/**
 * Compensation Schemas
 *
 * Zod schemas for step compensation and workflow-level compensation.
 */

import { z } from 'zod';
import { compensationActionSchema, actionSchema } from './action.schemas';

/**
 * Step compensation configuration
 */
export const stepCompensationSchema = z.object({
  type: z.enum(['reverse', 'custom']),
  action: compensationActionSchema
});

/**
 * Full step schema
 */
export const stepSchema = z.object({
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

/**
 * Workflow-level compensation schema
 */
export const compensationSchema = z.object({
  type: z.enum(['sequential', 'parallel']),
  steps: z.array(stepSchema).min(1)
});
