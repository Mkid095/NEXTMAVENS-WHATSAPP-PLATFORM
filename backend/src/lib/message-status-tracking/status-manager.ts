/**
 * Status Manager - Compatibility Shim
 *
 * This file re-exports from the new modular structure.
 * Kept for backward compatibility with existing imports.
 */

// Re-export everything from the new modular structure
export * from './services';
export * from './system';
export * from './utils';
export * from './types';

// Also re-export the specific items that were previously imported
// (these are already covered by the above, but explicit for clarity)
export {
  updateMessageStatus,
  validateTransition,
  getStatusHistory,
  getLatestStatus,
  getStatusMetrics,
  updateStatusMetrics,
  setSocketService,
  recordStatusChangeFromReceipt,
  recordDlqTransfer,
  createStatusHistoryEntry
} from './services';
