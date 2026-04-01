/**
 * Status Type Utilities
 * Helper functions for working with status types
 */

import { MessageStatus } from '@prisma/client';

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
    READ: [],    // Terminal state
    FAILED: [],  // Terminal state (but might be retried from DLQ)
    REJECTED: [], // Terminal
    CANCELLED: [] // Terminal
  };

  if (!current) {
    // All possible statuses
    return Object.values(MessageStatus) as MessageStatus[];
  }

  return transitions[current] || [];
}
