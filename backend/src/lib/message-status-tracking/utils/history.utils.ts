/**
 * History Utilities
 *
 * Helper functions for working with status history.
 */

import { prisma } from '../../prisma';

/**
 * Create a status history entry
 * This is a low-level utility; typically use record* methods from system.integration instead.
 */
import type { MessageStatus, StatusChangeReason } from '../types';

export async function createStatusHistoryEntry(
  messageId: string,
  orgId: string,
  status: MessageStatus,
  reason: StatusChangeReason,
  changedBy: string = 'system',
  metadata?: Record<string, any>
): Promise<void> {
  await prisma.messageStatusHistory.create({
    data: {
      messageId,
      status,
      changedBy: changedBy === 'system' ? null : changedBy,
      reason,
      metadata
    }
  });
}
