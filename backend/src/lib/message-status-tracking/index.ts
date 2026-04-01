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

export * from './types';

export {
  // Core services
  updateMessageStatus,
  validateTransition,
  // Query services
  getStatusHistory,
  getLatestStatus,
  // Metrics services
  getStatusMetrics,
  updateStatusMetrics,
  // System integration
  setSocketService,
  recordStatusChangeFromReceipt,
  recordDlqTransfer,
  createStatusHistoryEntry
} from './services';

export { emitStatusChangeEvent } from './utils';

// Re-export types for convenience
export { MessageStatus } from '@prisma/client';
