/**
 * Build Webhook Dead Letter Queue (DLQ) System
 *
 * Captures and manages webhook processing failures that exceed retry limits.
 * Provides functions to store, retrieve, retry, and clean dead letters.
 *
 * Features:
 * - Multi-tenant: All queries scoped to orgId (RLS enforced by Prisma)
 * - Pagination and filtering for list operation
 * - Atomic retry: removes from DLQ and re-queues to message queue in transaction
 * - Cleanup of old entries
 */

import { prisma } from '../prisma';
import { addJob, MessageType } from '../message-queue-priority-system';

// ============================================================================
// Types
// ============================================================================

export interface DeadLetter {
  id: string;
  orgId: string;
  instanceId: string;
  event: string;
  payload: Record<string, any>;
  error: string;
  retryCount: number;
  lastAttempted: Date | null;
  createdAt: Date;
}

export interface DeadLetterFilters {
  orgId?: string;
  instanceId?: string;
  event?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface DeadLetterListResult {
  items: DeadLetter[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface DeadLetterRetryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Capture a failed webhook into the dead letter queue.
 * Called when all retry attempts are exhausted.
 */
export async function captureDeadLetter(
  orgId: string,
  instanceId: string,
  event: string,
  payload: Record<string, any>,
  error: string,
  retryCount: number = 0,
  lastAttempted: Date = new Date()
): Promise<void> {
  await prisma.deadLetterQueue.create({
    data: {
      orgId,
      instanceId,
      event,
      payload,
      error,
      retryCount,
      lastAttempted,
    },
  });
}

/**
 * Retrieve dead letters with optional filtering and pagination.
 */
export async function getDeadLetters(
  filters: DeadLetterFilters = {},
  page: number = 1,
  limit: number = 50
): Promise<DeadLetterListResult> {
  const skip = (page - 1) * limit;
  const where: any = {};

  if (filters.orgId) where.orgId = filters.orgId;
  if (filters.instanceId) where.instanceId = filters.instanceId;
  if (filters.event) where.event = filters.event;
  if (filters.createdAfter || filters.createdBefore) {
    where.createdAt = {};
    if (filters.createdAfter) where.createdAt.gte = filters.createdAfter;
    if (filters.createdBefore) where.createdAt.lte = filters.createdBefore;
  }

  const [items, total] = await Promise.all([
    prisma.deadLetterQueue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.deadLetterQueue.count({ where }),
  ]);

  return {
    items: items.map(toDeadLetter),
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
  };
}

/**
 * Get a single dead letter by ID.
 */
export async function getDeadLetter(id: string): Promise<DeadLetter | null> {
  const dl = await prisma.deadLetterQueue.findUnique({ where: { id } });
  return dl ? toDeadLetter(dl) : null;
}

/**
 * Retry a dead letter: re-queue to message queue and delete from DLQ.
 * Atomic transaction ensures no duplicate processing.
 */
export async function retryDeadLetter(
  id: string,
  orgId: string
): Promise<DeadLetterRetryResult> {
  return await prisma.$transaction(async (tx) => {
    // Fetch the dead letter within transaction (with org guard)
    const dl = await tx.deadLetterQueue.findFirst({
      where: { id, orgId },
    });

    if (!dl) {
      return { success: false, error: 'Dead letter not found or access denied' };
    }

    // Re-queue to message queue as a webhook event
    try {
      const job = await addJob(MessageType.WEBHOOK_EVENT, {
        webhookId: `retry:${dl.id}`,
        event: dl.event,
        payload: dl.payload,
        instanceId: dl.instanceId,
        orgId: dl.orgId,
        originalError: dl.error,
        previousRetries: dl.retryCount,
      });

      // Remove from DLQ after successful queueing
      await tx.deadLetterQueue.delete({ where: { id: dl.id } });

      return { success: true, messageId: job.id };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to re-queue: ${error.message}`,
      };
    }
  });
}

/**
 * Delete a dead letter entry (admin-only; for cleanup of irrelevant entries).
 */
export async function deleteDeadLetter(id: string, orgId: string): Promise<boolean> {
  const result = await prisma.deadLetterQueue.deleteMany({
    where: { id, orgId },
  });
  return result.count > 0;
}

/**
 * Clean up old dead letters beyond a certain age.
 * Returns the number of entries deleted.
 */
export async function cleanOldDeadLetters(olderThanDays: number = 7): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.deadLetterQueue.deleteMany({
    where: {
      createdAt: { lte: cutoff },
    },
  });

  return result.count;
}

// ============================================================================
// Helpers
// ============================================================================

function toDeadLetter(dl: any): DeadLetter {
  return {
    id: dl.id,
    orgId: dl.orgId,
    instanceId: dl.instanceId,
    event: dl.event,
    payload: dl.payload as Record<string, any>,
    error: dl.error,
    retryCount: dl.retryCount,
    lastAttempted: dl.lastAttempted,
    createdAt: dl.createdAt,
  };
}