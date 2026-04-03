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

// Re-export core services (from services)
export {
  updateMessageStatus,
  validateTransition,
} from './services';

// Re-export query services
export {
  getStatusHistory,
  getLatestStatus,
} from './services';

// Re-export metrics services
export {
  getStatusMetrics,
  updateStatusMetrics,
} from './services';

// Re-export system integration functions (from system)
export {
  recordStatusChangeFromReceipt,
  recordDlqTransfer,
  createStatusHistoryEntry,
} from './system';

// Re-export socket utilities
export { setSocketService, emitStatusChangeEvent } from './utils/socket.utils';
