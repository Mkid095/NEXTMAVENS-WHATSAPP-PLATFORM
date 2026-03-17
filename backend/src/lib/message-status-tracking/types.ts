/**
 * Message Status Tracking System - Type Definitions
 * Provides comprehensive status history and audit trail
 */

import { MessageStatus } from '@prisma/client';

// ============================================================================
// Status Change Reason Types
// ============================================================================

/**
 * Reasons for status changes
 * Used for audit trail and debugging
 */
export enum StatusChangeReason {
  CREATION = 'creation',                 // Initial status when message created
  QUEUE_PROCESSING = 'queue',            // Status changed during queue processing
  WEBHOOK_UPDATE = 'webhook',            // Status updated from Evolution API webhook
  ADMIN_MANUAL = 'admin',                // Manual admin update via API
  DLQ_TRANSFER = 'dlq',                  // Message moved to DLQ (FAILED)
  RETRY_EXHAUSTED = 'retry_exhausted',   // Max retries reached
  AUTOMATIC_RECOVERY = 'automatic_recovery', // System auto-recovery action
  CANCELLATION = 'cancellation'          // Message cancelled by admin/user
}

// ============================================================================
// Status History Entry Types
// ============================================================================

/**
 * A single status change record
 */
export interface StatusHistoryEntry {
  id: string;
  messageId: string;
  status: MessageStatus;
  changedAt: Date;
  changedBy: string | null;     // user ID or 'system'
  reason: StatusChangeReason;
  metadata?: Record<string, any>;
}

/**
 * Query parameters for fetching status history
 */
export interface StatusHistoryQuery {
  messageId: string;
  orgId: string;
  limit?: number;
  offset?: string;      // Pagination cursor (ID)
  fromDate?: Date;
  toDate?: Date;
  status?: MessageStatus;
  reason?: StatusChangeReason;
}

/**
 * Paginated result for status history
 */
export interface PaginatedStatusHistory {
  entries: StatusHistoryEntry[];
  total: number;
  nextOffset: string | null;
  hasMore: boolean;
}

// ============================================================================
// Status Metrics Types
// ============================================================================

/**
 * Distribution of messages by current status
 */
export interface StatusDistribution {
  [status: string]: number;
}

/**
 * Status transition count (how many times each transition occurred)
 */
export interface StatusTransitionMetrics {
  [transition: string]: number;  // format: "PENDING->SENDING": 123
}

/**
 * Comprehensive status metrics
 */
export interface StatusMetrics {
  totalMessages: number;
  distribution: StatusDistribution;
  transitions: StatusTransitionMetrics;
  byReason: Record<StatusChangeReason, number>;
  updatedAt: Date;
}

// ============================================================================
// Status Update Request/Response
// ============================================================================

/**
 * Request to update message status
 */
export interface StatusUpdateRequest {
  status: MessageStatus;
  reason?: StatusChangeReason;
  changedBy?: string;      // User ID (defaults to 'system' if not provided)
  metadata?: Record<string, any>;
}

/**
 * Response after status update
 */
export interface StatusUpdateResponse {
  success: boolean;
  messageId: string;
  oldStatus: MessageStatus;
  newStatus: MessageStatus;
  historyEntryId: string;
  timestamp: Date;
}

// ============================================================================
// WebSocket Event Types
// ============================================================================

/**
 * Socket.IO event for status changes
 */
export interface StatusChangeEvent {
  type: 'message:status:changed';
  data: {
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
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format status transition key for metrics
 */
export function formatTransitionKey(from: MessageStatus, to: MessageStatus): string {
  return `${from}->${to}`;
}

/**
 * Get status color for UI display (consistent with design system)
 */
export function getStatusColor(status: MessageStatus): string {
  const colors: Record<MessageStatus, string> = {
    PENDING: '#F59E0B',      // amber
    SENDING: '#3B82F6',      // blue
    SENT: '#10B981',         // green
    DELIVERED: '#10B981',    // green
    READ: '#059669',         // dark green
    FAILED: '#EF4444',       // red
    REJECTED: '#DC2626',     // dark red
    CANCELLED: '#6B7280'     // gray
  };
  return colors[status] || '#6B7280';
}

/**
 * Get status display label
 */
export function getStatusLabel(status: MessageStatus): string {
  const labels: Record<MessageStatus, string> = {
    PENDING: 'Pending',
    SENDING: 'Sending',
    SENT: 'Sent',
    DELIVERED: 'Delivered',
    READ: 'Read',
    FAILED: 'Failed',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled'
  };
  return labels[status] || status;
}

/**
 * Check if status indicates successful delivery
 */
export function isSuccessStatus(status: MessageStatus): boolean {
  return ['SENT', 'DELIVERED', 'READ'].includes(status);
}

/**
 * Check if status indicates failure
 */
export function isFailureStatus(status: MessageStatus): boolean {
  return ['FAILED', 'REJECTED', 'CANCELLED'].includes(status);
}

/**
 * Get valid next status transitions (business rules)
 */
export function getAllowedTransitions(current?: MessageStatus): MessageStatus[] {
  const transitions: Record<MessageStatus, MessageStatus[]> = {
    PENDING: ['SENDING', 'SENT', 'FAILED', 'CANCELLED'],
    SENDING: ['SENT', 'DELIVERED', 'FAILED', 'READ'],
    SENT: ['DELIVERED', 'FAILED'],
    DELIVERED: ['READ', 'FAILED'],
    READ: [],  // Terminal state
    FAILED: [], // Terminal state (but might be retried from DLQ)
    REJECTED: [], // Terminal
    CANCELLED: [] // Terminal
  };

  if (!current) {
    // All possible statuses
    return Object.values(MessageStatus) as MessageStatus[];
  }

  return transitions[current] || [];
}
