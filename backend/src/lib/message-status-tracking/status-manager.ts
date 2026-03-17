/**
 * Status Manager
 * Centralized logic for updating message status with history tracking
 */

import { prisma } from '../prisma';
import { MessageStatus } from '@prisma/client';
import {
  StatusChangeReason,
  StatusHistoryEntry,
  StatusUpdateRequest,
  StatusUpdateResponse,
  isSuccessStatus,
  isFailureStatus,
  formatTransitionKey
} from './types';

// Import metrics (optional, may not be initialized yet)
let statusMetrics: any = null;
try {
  const metrics = require('../create-comprehensive-metrics-dashboard-(grafana)/index');
  statusMetrics = {
    messageStatusDistribution: metrics.messageStatusDistribution,
    messageStatusTransitionsTotal: metrics.messageStatusTransitionsTotal,
    messageStatusUpdateDuration: metrics.messageStatusUpdateDuration,
    messageStatusHistoryEntriesTotal: metrics.messageStatusHistoryEntriesTotal
  };
} catch (err) {
  // Metrics not available yet, will be set later via setMetrics()
}

// ============================================================================
// Core Status Update Function
// ============================================================================

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

  // Business logic: Validate transition (optional but recommended)
  validateTransition(oldStatus, status, reason);

  // Build update data for WhatsAppMessage
  const updateData: any = { status };

  // Set appropriate timestamps based on new status
  const now = new Date();
  switch (status) {
    case 'SENDING':
      // Equivalent to SENDING status
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
      // Cancelled doesn't have a specific timestamp, but could use metadata
      break;
  }

  // If moving from failure to success, clear failure reason
  if (isSuccessStatus(status) && (oldStatus === 'FAILED' || oldStatus === 'REJECTED')) {
    updateData.failureReason = null;
  }

  // Perform update and history creation in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Update message
    const updatedMessage = await tx.whatsAppMessage.update({
      where: { id: messageId },
      data: updateData,
      select: {
        id: true,
        status: true,
        updatedAt: true
      }
    });

    // 2. Create history entry
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
    messageStatusUpdateDuration.observe({ reason: reason }, duration);
    messageStatusTransitionsTotal.inc({ from: oldStatus, to: status, reason: reason });
    messageStatusHistoryEntriesTotal.inc({ reason: reason });

    // Update distribution gauge: decrement old status count, increment new status count
    // Note: We can't directly decrement gauges reliably in distributed systems,
    // but we can periodically recompute distribution via getStatusMetrics()
    // For now, just increment new status count (may be slightly off but acceptable for monitoring)
    messageStatusDistribution.inc({ status: status, orgId: message.orgId });
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
    console.warn('[StatusManager] Failed to emit socket event:', err.message);
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
  // Terminal states cannot transition further (except maybe by force?)
  const terminalStates = ['READ', 'FAILED', 'REJECTED', 'CANCELLED'];

  // If moving from terminal to another state, that's unusual - require explicit override?
  // For now, allow it if reason is ADMIN_MANUAL (admin override)
  if (terminalStates.includes(from) && from !== to) {
    if (reason !== StatusChangeReason.ADMIN_MANUAL) {
      throw new Error(`Cannot transition from terminal state ${from} to ${to} without admin override`);
    }
  }

  // PENDING can go to SENDING, SENT, FAILED, CANCELLED
  // SENDING can go to SENT, DELIVERED, FAILED, READ
  // etc.
  // Simplify: just allow any transition for now, could be stricter later
  // We already have getAllowedTransitions in types.ts
}

// ============================================================================
// History Query Functions
// ============================================================================

/**
 * Get status history for a message
 */
export async function getStatusHistory(
  messageId: string,
  orgId: string,
  query: {
    limit?: number;
    offset?: string;
    fromDate?: Date;
    toDate?: Date;
    status?: MessageStatus;
    reason?: StatusChangeReason;
  } = {}
): Promise<StatusHistoryEntry[]> {
  const limit = query.limit || 50;
  const where: any = {
    messageId,
    message: {
      orgId  // Ensure message belongs to this org
    }
  };

  // Apply filters
  if (query.fromDate || query.toDate) {
    where.changedAt = {};
    if (query.fromDate) where.changedAt.gte = query.fromDate;
    if (query.toDate) where.changedAt.lte = query.toDate;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.reason) {
    where.reason = query.reason;
  }

  // Build order and pagination
  const orderBy = { changedAt: 'desc' as const };
  const skip = query.offset ? 1 : 0; // Simple offset-based, could use cursor

  const entries = await prisma.messageStatusHistory.findMany({
    where,
    orderBy,
    take: limit + 1, // +1 to check if there's more
    skip,
    include: {
      message: {
        select: {
          id: true,
          orgId: true
        }
      }
    }
  });

  // Filter by orgId from message relation (extra safety)
  const filtered = entries.filter(e => e.message.orgId === orgId);

  return filtered.slice(0, limit);
}

/**
 * Get the latest status from history (or from message if no history)
 */
export async function getLatestStatus(messageId: string, orgId: string): Promise<{
  status: MessageStatus;
  updatedAt: Date;
  changedBy: string | null;
  reason?: string;
}> {
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      status: true,
      updatedAt: true,
      orgId: true
    }
  });

  if (!message || message.orgId !== orgId) {
    throw new Error(`Message ${messageId} not found or access denied`);
  }

  return {
    status: message.status,
    updatedAt: message.updatedAt,
    changedBy: null,
    reason: 'latest_from_message'
  };
}

// ============================================================================
// Metrics Collection
// ============================================================================

// Lazy-loaded metrics
let statusDistributionGauge: any = null;
let statusTransitionCounter: any = null;

function getMetrics() {
  if (!statusDistributionGauge) {
    const { register } = require('prom-client');
    statusDistributionGauge = new require('prom-client').Gauge({
      name: 'whatsapp_platform_message_status_total',
      help: 'Current distribution of message statuses',
      labelNames: ['status', 'orgId']
    });
    statusTransitionCounter = new require('prom-client').Counter({
      name: 'whatsapp_platform_message_status_transitions_total',
      help: 'Total status transitions',
      labelNames: ['from', 'to', 'reason']
    });
  }
  return { statusDistributionGauge, statusTransitionCounter };
}

/**
 * Update status distribution metrics (call periodically)
 */
export async function updateStatusMetrics(): Promise<void> {
  try {
    const { statusDistributionGauge, statusTransitionCounter } = getMetrics();

    // Get counts by status across all orgs (or could filter by org)
    const counts = await prisma.whatsAppMessage.groupBy({
      by: ['status'],
      _count: { status: true }
    });

    statusDistributionGauge.reset();
    for (const { status, _count } of counts) {
      statusDistributionGauge.inc({ status, orgId: 'all' }, _count);
    }
  } catch (error) {
    console.warn('[StatusMetrics] Failed to update metrics:', error);
  }
}

/**
 * Get status metrics (distribution and transitions)
 * This is the main function to call for reporting
 */
export async function getStatusMetrics(orgId?: string): Promise<StatusMetrics> {
  try {
    // Get total message count by current status
    const messageCountWhere: any = {};
    if (orgId) {
      messageCountWhere.orgId = orgId;
    }

    const messageCounts = await prisma.whatsAppMessage.groupBy({
      by: ['status'],
      where: messageCountWhere,
      _count: { status: true }
    });

    const distribution: StatusDistribution = {};
    let totalMessages = 0;
    for (const { status, _count } of messageCounts) {
      distribution[status] = _count;
      totalMessages += _count;
    }

    // For transitions, we need to query history
    // However, computing transitions across entire dataset is expensive
    // So we'll just compute for recent history (same as updateStatusMetrics)
    // Or we can compute on-demand with limits
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const historyWhere: any = {
      changedAt: { gte: sevenDaysAgo }
    };
    if (orgId) {
      historyWhere.message = { orgId };
    }

    const recentHistory = await prisma.messageStatusHistory.findMany({
      where: historyWhere,
      orderBy: { changedAt: 'desc' },
      select: {
        status: true,
        changedAt: true,
        messageId: true
      },
      // Limit to 10k most recent to avoid memory issues
      take: 10000
    });

    // Compute transitions by pairing consecutive entries per message
    const transitions: StatusTransitionMetrics = {};
    const byMessage = new Map<string, typeof recentHistory>();

    for (const entry of recentHistory) {
      const existing = byMessage.get(entry.messageId) || [];
      existing.push(entry);
      byMessage.set(entry.messageId, existing);
    }

    for (const entries of byMessage.values()) {
      // Entries are descending by changedAt, reverse to chronological
      const chronological = entries.reverse();
      for (let i = 1; i < chronological.length; i++) {
        const prev = chronological[i - 1];
        const curr = chronological[i];
        const key = formatTransitionKey(prev.status, curr.status);
        transitions[key] = (transitions[key] || 0) + 1;
      }
    }

    // Count by reason
    const reasonWhere: any = {
      changedAt: { gte: sevenDaysAgo }
    };
    if (orgId) {
      reasonWhere.message = { orgId };
    }

    const reasonCounts = await prisma.messageStatusHistory.groupBy({
      by: ['reason'],
      where: reasonWhere,
      _count: { reason: true }
    });

    const byReason: Record<StatusChangeReason, number> = {} as any;
    for (const { reason, _count } of reasonCounts) {
      if (reason) {
        byReason[reason as StatusChangeReason] = _count;
      }
    }

    // Update the prometheus gauge if no org filter (global view)
    if (!orgId) {
      const { statusDistributionGauge } = getMetrics();
      statusDistributionGauge.reset();
      for (const [status, count] of Object.entries(distribution)) {
        statusDistributionGauge.inc({ status, orgId: 'global' }, count);
      }
    }

    return {
      totalMessages,
      distribution,
      transitions,
      byReason,
      updatedAt: new Date()
    };
  } catch (error) {
    console.error('[StatusMetrics] Failed to compute metrics:', error);
    throw error;
  }
}

// ============================================================================
// Socket.IO Integration
// ============================================================================

let socketService: any = null;

/**
 * Set the Socket.IO service for real-time notifications
 */
export function setSocketService(service: any): void {
  socketService = service;
}

/**
 * Emit status change event to Socket.IO subscribers
 */
async function emitStatusChangeEvent(event: {
  messageId: string;
  orgId: string;
  instanceId?: string;
  chatId?: string;
  oldStatus: MessageStatus;
  newStatus: MessageStatus;
  timestamp: Date;
  changedBy: string | null;
  reason: StatusChangeReason;
  metadata?: Record<string, any>;
}): Promise<void> {
  if (!socketService) {
    return;
  }

  try {
    // Broadcast to organization room
    await socketService.broadcastToOrg(orgId, 'message:status:changed', {
      messageId: event.messageId,
      instanceId: event.instanceId,
      chatId: event.chatId,
      oldStatus: event.oldStatus,
      newStatus: event.newStatus,
      timestamp: event.timestamp.getTime(),
      changedBy: event.changedBy,
      reason: event.reason,
      ...event.metadata
    });

    // Also broadcast to specific instance if available
    if (event.instanceId) {
      await socketService.broadcastToInstance(orgId, event.instanceId, {
        type: 'message:status:changed',
        data: {
          messageId: event.messageId,
          oldStatus: event.oldStatus,
          newStatus: event.newStatus,
          timestamp: event.timestamp.getTime(),
          reason: event.reason
        }
      });
    }
  } catch (error) {
    console.warn('[StatusManager] Socket emit failed:', error);
  }
}

// ============================================================================
// System Event Integration
// ============================================================================

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
): Promise<StatusUpdateResponse> {
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
): Promise<StatusUpdateResponse> {
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
): Promise<StatusUpdateResponse> {
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

// Prisma client is imported at top

// ============================================================================
// Utility Functions (Internal)
// ============================================================================

/**
 * Create a status history entry without updating the WhatsAppMessage
 * Use when the message status has already been updated elsewhere (e.g., queue processors)
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

  // Update metrics
  if (statusMetrics) {
    messageStatusHistoryEntriesTotal.inc({ reason: reason });
    // Also increment distribution gauge for this status
    messageStatusDistribution.inc({ status, orgId });
  }
}

