/**
 * Dead Letter Queue (DLQ) - Modularized
 *
 * Main entry point - re-exports all DLQ components.
 *
 * Architecture:
 * - types.ts: Type definitions
 * - client.ts: Redis client management
 * - config.ts: Configuration constants
 * - helpers.ts: Shared helper functions
 * - stream.operations.ts: Stream-level operations
 * - write.operations.ts: Write operations (add, delete, requeue, cleanup)
 * - query.operations.ts: Query operations (get entry, metrics)
 * - list.operations.ts: List/pagination operations
 * - consumer.ts: Consumer group setup
 *
 * All files under 150 lines.
 */

// Configuration and constants
export * from './config';

// Redis client
export * from './client';

// Types
export * from '../types';

// Stream operations
export { getAllDlqStreamKeys, getDlqStreamKey, dlqStreamExists, getDlqStreamInfo } from './stream.operations';

// Write operations
export { addToDlq, deleteDlqEntry, deleteDlqEntries, clearDlqStream } from './write.operations';

// Maintenance operations
export { requeueFromDlq, cleanOldDlqEntries } from './maintenance.operations';

// Query operations
export { getDlqEntry, getDlqMetrics } from './query.operations';

// List operations
export { listDlqEntries } from './list.operations';

// Helpers
export { pairsFromFlat, getRetryCountBucket } from './helpers';

// Consumer group setup
export * from './consumer';
