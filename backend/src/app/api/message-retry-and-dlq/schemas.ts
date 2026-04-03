/**
 * DLQ Handler Validation Schemas
 *
 * Zod schemas for validating DLQ admin API requests.
 */

import { z } from 'zod';
import { ErrorCategory } from '../../../lib/message-retry-and-dlq-system/error-classification.types.ts';

/**
 * Query parameters for listing DLQ messages
 * Used by: listDlqMessagesHandler
 */
export const dlqQuerySchema = z.object({
  messageType: z.string().optional(),
  errorCategory: z.nativeEnum(ErrorCategory).optional(),
  minRetries: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.string().optional(),
  newestFirst: z.boolean().optional().default(true),
});

/**
 * Bulk delete DLQ messages
 * Used by: bulkDeleteDlqMessagesHandler
 */
export const dlqBulkDeleteSchema = z.object({
  messageType: z.string().optional(),
  errorCategory: z.nativeEnum(ErrorCategory).optional(),
  olderThanDays: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(1000).default(100),
});

/**
 * Retry (replay) DLQ entries
 * Used by: retryAllDlqMessagesHandler
 */
export const dlqReplaySchema = z.object({
  messageType: z.string().optional(),
  errorCategory: z.nativeEnum(ErrorCategory).optional(),
  limit: z.number().int().positive().max(1000).default(100),
  dryRun: z.boolean().optional().default(false),
});
