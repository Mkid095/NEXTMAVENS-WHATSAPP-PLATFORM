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

// Core services
export {
  updateMessageStatus,
  validateTransition,
} from './services';

// Query services
export {
  getStatusHistory,
  getLatestStatus,
} from './services';

// Metrics services
export {
  getStatusMetrics,
  updateStatusMetrics,
} from './services';

// System integration functions
export {
  recordStatusChangeFromReceipt,
  recordDlqTransfer,
  createStatusHistoryEntry,
} from './system';

// Socket utilities
export {
  setSocketService,
  emitStatusChangeEvent,
} from './utils/socket.utils';

// Re-export types for convenience
export { MessageStatus } from '@prisma/client';
