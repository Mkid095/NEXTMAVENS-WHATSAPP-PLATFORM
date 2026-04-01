/**
 * Action Schemas
 *
 * Zod schemas for validating workflow step actions and compensation.
 */

import { z } from 'zod';

/**
 * Message action configuration
 */
export const messageActionSchema = z.object({
  type: z.literal('message'),
  config: z.object({
    to: z.string().min(1),
    message: z.any(),
    messageType: z.enum(['text', 'image', 'video', 'audio', 'document', 'template']).optional().default('text')
  }).required()
});

/**
 * API call action configuration
 */
export const apiCallActionSchema = z.object({
  type: z.literal('api-call'),
  config: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('POST'),
    headers: z.record(z.string(), z.string()).optional().default({}),
    body: z.any().optional()
  }).required()
});

/**
 * Queue job action configuration
 */
export const queueJobActionSchema = z.object({
  type: z.literal('queue-job'),
  config: z.object({
    jobType: z.enum(['MESSAGE_UPSERT', 'MESSAGE_STATUS_UPDATE', 'INSTANCE_STATUS_UPDATE', 'ANALYTICS_EVENT']),
    payload: z.record(z.string(), z.any())
  }).required()
});

/**
 * Delay action configuration
 */
export const delayActionSchema = z.object({
  type: z.literal('delay'),
  config: z.object({
    delayMs: z.number().int().positive()
  }).required()
});

/**
 * Custom action configuration
 */
export const customActionSchema = z.object({
  type: z.literal('custom'),
  config: z.object({
    handler: z.string().min(1),
    params: z.record(z.string(), z.any()).optional().default({})
  }).required()
});

/**
 * Parallel action configuration
 */
export const parallelActionSchema = z.object({
  type: z.literal('parallel'),
  config: z.object({
    maxConcurrent: z.number().int().positive().optional().default(5)
  }).required()
});

/**
 * Union of all action types
 */
export const actionSchema = z.discriminatedUnion('type', [
  messageActionSchema,
  apiCallActionSchema,
  queueJobActionSchema,
  delayActionSchema,
  customActionSchema,
  parallelActionSchema
]);

/**
 * Compensation action (used within steps and workflow-level compensation)
 */
export const compensationActionSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.string(), z.any())
});
