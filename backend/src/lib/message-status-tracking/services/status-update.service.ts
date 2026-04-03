/**
 * Status Update Service
 *
 * Core business logic for updating message status with audit trail.
 */

import { prisma } from '../../prisma';
import { MessageStatus } from '@prisma/client';
import { StatusChangeReason, StatusUpdateRequest, StatusUpdateResponse } from '../types';
import { setSocketService, emitStatusChangeEvent } from '../utils/socket.utils';
import { isSuccessStatus } from '../types';

// Optional metrics integration
let statusMetrics: any = null;
try {
  const metrics = require('../../create-comprehensive-metrics-dashboard-(grafana)/index');
  statusMetrics = {
    messageStatusDistribution: metrics.messageStatusDistribution,
    messageStatusTransitionsTotal: metrics.messageStatusTransitionsTotal,
    messageStatusUpdateDuration: metrics.messageStatusUpdateDuration,
    messageStatusHistoryEntriesTotal: metrics.messageStatusHistoryEntriesTotal
  };
} catch (err) {
  // Metrics not available yet, will be set later via setMetrics()
}

/**
 * Update a message's status with full audit trail
 *
 * This function:
 * 1. Validates the status transition
 * 2. Updates the WhatsAppMessage record (status + appropriate timestamps)
 * 3. Creates a history entry
 * 4. Emits Socket.IO event (if socket service available)
 * 5. Updates metrics
 *
 * @param messageId - Message ID
 * @param orgId - Organization ID (for RLS enforcement)
 * @param request - Status update request
 * @returns StatusUpdateResponse with history entry
 */
export async function updateMessageStatus(
  messageId: string,
  orgId: string,
  request: StatusUpdateRequest
): Promise<StatusUpdateResponse> {
  const { status, reason = StatusChangeReason.ADMIN_MANUAL, changedBy = 'system', metadata } = request;
  const startTime = Date.now();

  // Fetch current message state (with orgId check for tenant isolation)
  const message = await prisma.whatsAppMessage.findFirst({
    where: { id: messageId, orgId },
    select: {
      id: true,
      status: true,
      instanceId: true,
      chatId: true,
      orgId: true
    }
  });

  if (!message) {
    throw new Error(`Message ${messageId} not found or access denied`);
  }

  const oldStatus = message.status;

  // Business logic: Validate transition
  validateTransition(oldStatus, status, reason);

  // Build update data for WhatsAppMessage
  const updateData: any = { status };

  // Set appropriate timestamps based on new status
  const now = new Date();
  switch (status) {
    case 'SENDING':
      updateData.sentAt = now;
      break;
    case 'SENT':
      updateData.sentAt = now;
      break;
    case 'DELIVERED':
      updateData.deliveredAt = now;
      break;
    case 'READ':
      updateData.readAt = now;
      break;
    case 'FAILED':
    case 'REJECTED':
      updateData.failedAt = now;
      updateData.failureReason = metadata?.failureReason || 'Status updated manually';
      break;
    case 'CANCELLED':
      // Cancelled doesn't have a specific timestamp
      break;
  }

  // If moving from failure to success, clear failure reason
  if (isSuccessStatus(status) && (oldStatus === 'FAILED' || oldStatus === 'REJECTED')) {
    updateData.failureReason = null;
  }

  // Perform update and history creation in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const updatedMessage = await tx.whatsAppMessage.update({
      where: { id: messageId },
      data: updateData,
      select: {
        id: true,
        status: true,
        updatedAt: true
      }
    });

    const historyEntry = await tx.messageStatusHistory.create({
      data: {
        messageId,
        status,
        changedBy: changedBy === 'system' ? null : changedBy,
        reason,
        metadata: metadata ? { ...metadata, previousStatus: oldStatus } : { previousStatus: oldStatus }
      },
      select: {
        id: true,
        changedAt: true,
        status: true
      }
    });

    return { updatedMessage, historyEntry };
  });

  // Record metrics (if available)
  if (statusMetrics) {
    const duration = (Date.now() - startTime) / 1000;
    statusMetrics.messageStatusUpdateDuration.observe({ reason: reason }, duration);
    statusMetrics.messageStatusTransitionsTotal.inc({ from: oldStatus, to: status, reason: reason });
    statusMetrics.messageStatusHistoryEntriesTotal.inc({ reason: reason });
    // Update distribution gauge
    statusMetrics.messageStatusDistribution.inc({ status: status, org_id: message.orgId });
  }

  // Emit Socket.IO event (async, don't block)
  emitStatusChangeEvent({
    messageId,
    orgId: message.orgId,
    instanceId: message.instanceId,
    chatId: message.chatId,
    oldStatus,
    newStatus: status,
    timestamp: result.historyEntry.changedAt,
    changedBy: changedBy === 'system' ? null : changedBy,
    reason,
    metadata
  }).catch(err => {
    console.warn('[StatusUpdateService] Failed to emit socket event:', err.message);
  });

  return {
    success: true,
    messageId,
    oldStatus,
    newStatus: status,
    historyEntryId: result.historyEntry.id,
    timestamp: result.historyEntry.changedAt,
    instanceId: message.instanceId,
    chatId: message.chatId,
    orgId: message.orgId
  };
}

/**
 * Validate a status transition based on business rules
 * Throws if transition is not allowed
 */
export function validateTransition(
  from: MessageStatus,
  to: MessageStatus,
  reason: StatusChangeReason
): void {
  const terminalStates = ['READ', 'FAILED', 'REJECTED', 'CANCELLED'];

  if (terminalStates.includes(from) && from !== to) {
    if (reason !== StatusChangeReason.ADMIN_MANUAL) {
      throw new Error(`Cannot transition from terminal state ${from} to ${to} without admin override`);
    }
  }
}
