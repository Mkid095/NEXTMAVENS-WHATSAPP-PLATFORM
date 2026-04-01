/**
 * DLQ Admin API Validation Schemas
 */

import { z } from 'zod';
import { ErrorCategory } from '../../../lib/message-retry-and-dlq-system/types';

/**
 * Query parameters for listing DLQ entries
 */
export const dlqQuerySchema = z.object({
  messageType: z.string().optional(),
  errorCategory: z.enum([ErrorCategory.TRANSIENT, ErrorCategory.PERMANENT, ErrorCategory.UNKNOWN]).optional(),
  minRetries: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.string().optional(),
  newestFirst: z.boolean().default(true)
});

/**
 * Body for replaying DLQ entries
 */
export const dlqReplaySchema = z.object({
  messageType: z.string().optional(),
  errorCategory: z.enum([ErrorCategory.TRANSIENT, ErrorCategory.PERMANENT, ErrorCategory.UNKNOWN]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  dryRun: z.boolean().default(false)
});

/**
 * Body for bulk delete operations
 */
export const dlqBulkDeleteSchema = z.object({
  messageType: z.string().optional(),
  errorCategory: z.enum([ErrorCategory.TRANSIENT, ErrorCategory.PERMANENT, ErrorCategory.UNKNOWN]).optional(),
  olderThanDays: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional()
});
