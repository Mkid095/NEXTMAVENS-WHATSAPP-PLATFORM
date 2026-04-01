/**
 * Rate Limiting API - Zod Schemas
 */

import { z } from 'zod';

/**
 * Create rule request schema
 */
export const createRuleSchema = z.object({
  ruleId: z.string().min(1),
  orgId: z.string().uuid().optional().nullable(),
  instanceId: z.string().optional().nullable(),
  endpoint: z.string().min(1),
  maxRequests: z.number().int().positive(),
  windowMs: z.number().int().positive(),
  trackMetrics: z.boolean().optional().default(true)
});

/**
 * Update rule request schema
 */
export const updateRuleSchema = z.object({
  orgId: z.string().uuid().optional().nullable(),
  instanceId: z.string().optional().nullable(),
  endpoint: z.string().min(1),
  maxRequests: z.number().int().positive().optional(),
  windowMs: z.number().int().positive().optional(),
  trackMetrics: z.boolean().optional()
});

/**
 * Status query schema
 */
export const statusQuerySchema = z.object({
  identifier: z.string().min(1),
  ruleId: z.string().optional()
});

/**
 * Reset request schema
 */
export const resetSchema = z.object({
  identifier: z.string().min(1),
  ruleId: z.string().optional()
});
