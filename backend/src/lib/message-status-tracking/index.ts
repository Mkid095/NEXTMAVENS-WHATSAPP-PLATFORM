/**
 * Message Status Tracking System - Public API
 *
 * Provides comprehensive status history, audit trail, and real-time notifications.
 * Integrates with message queue and delivery receipts.
 *
 * Usage:
 * - Update status: await updateMessageStatus(messageId, orgId, { status: 'DELIVERED' })
 * - Get history: await getStatusHistory(messageId, orgId)
 * - Get metrics: await getStatusMetrics(orgId)
 */

export {
  // Types and enums
  StatusChangeReason,
  type StatusHistoryEntry,
  type PaginatedStatusHistory,
  type StatusUpdateRequest,
  type StatusUpdateResponse,
  type StatusMetrics,
  type StatusDistribution,
  type StatusTransitionMetrics,
  type StatusChangeEvent,
  formatTransitionKey,
  getStatusColor,
  getStatusLabel,
  isSuccessStatus,
  isFailureStatus,
  getAllowedTransitions
} from './types';

export {
  // Core Status Manager
  updateMessageStatus,
  getStatusHistory,
  getLatestStatus,
  getStatusMetrics,
  updateStatusMetrics,
  validateTransition,
  setSocketService,
  recordStatusChangeFromReceipt,
  recordDlqTransfer,
  createStatusHistoryEntry
} from './status-manager';

// Re-export types for convenience
export { MessageStatus } from '@prisma/client';
