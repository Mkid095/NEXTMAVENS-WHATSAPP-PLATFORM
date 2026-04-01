/**
 * System Integration Hooks
 *
 * Functions that integrate with other systems (receipts, DLQ, queue).
 */

import { prisma } from '../../prisma';
import { MessageStatus, StatusChangeReason } from '../types';
import { updateMessageStatus } from '../services/status-update.service';
import { createStatusHistoryEntry as createHistoryEntry } from '../utils/history.utils';

/**
 * Hook into existing receipt update system to also record history
 * Call this from delivery receipts updateReceiptFromEvent
 */
export async function recordStatusChangeFromReceipt(
  messageId: string,
  orgId: string,
  newStatus: MessageStatus,
  timestamp?: Date,
  failureReason?: string
): Promise<import('../types').StatusUpdateResponse> {
  return updateMessageStatus(messageId, orgId, {
    status: newStatus,
    reason: StatusChangeReason.WEBHOOK_UPDATE,
    changedBy: 'system',
    metadata: {
      timestamp,
      failureReason,
      source: 'evolution-webhook'
    }
  });
}

/**
 * Record status change when message is moved to DLQ
 */
export async function recordDlqTransfer(
  messageId: string,
  orgId: string,
  oldStatus: MessageStatus,
  error: string,
  retryCount: number
): Promise<import('../types').StatusUpdateResponse> {
  return updateMessageStatus(messageId, orgId, {
    status: 'FAILED',
    reason: StatusChangeReason.DLQ_TRANSFER,
    changedBy: 'system',
    metadata: {
      error,
      retryCount,
      source: 'retry-dlq-system'
    }
  });
}

/**
 * Record status change from queue processing (job completion)
 * Used by message queue workers to track processing lifecycle
 */
export async function recordSystemStatusChange(
  messageId: string,
  orgId: string,
  newStatus: MessageStatus,
  metadata?: Record<string, any>
): Promise<import('../types').StatusUpdateResponse> {
  return updateMessageStatus(messageId, orgId, {
    status: newStatus,
    reason: StatusChangeReason.QUEUE_PROCESSING,
    changedBy: 'system',
    metadata: {
      ...metadata,
      source: 'queue-worker'
    }
  });
}

/**
 * Create a status history entry without updating the WhatsAppMessage
 * Use when the message status has already been updated elsewhere
 */
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
