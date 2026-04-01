/**
 * Message Delivery Receipts System
 *
 * Provides structured access to message delivery status and metrics.
 * Re-exports all service functions.
 */

// Builder
export { buildReceipt } from './services/receipt.builder';

// Query operations
export {
  getReceipt,
  queryReceipts,
  getChatReceipts,
  isDelivered,
  getPendingCount
} from './services/queries.service';

// Update operations
export {
  updateReceiptFromEvent,
  batchUpdateReceipts
} from './services/updates.service';

// Metrics
export { getDeliveryMetrics } from './services/delivery.metrics';

// Types
export * from './types';
