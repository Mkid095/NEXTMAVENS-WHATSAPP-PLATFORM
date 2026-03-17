/**
 * Message Retry and DLQ System - Public API
 *
 * This module provides comprehensive failure handling for BullMQ message queues:
 * - Exponential backoff with jitter for smart retries
 * - Dead Letter Queue (DLQ) for permanently failed messages
 * - Error classification (transient vs permanent)
 * - Configurable retry policies per message type
 * - Metrics and monitoring integration
 *
 * Usage:
 *   1. Import enhancer and wrap existing processor
 *   2. Start enhanced worker instead of original worker
 *   3. Monitor DLQ via admin API
 *
 * Feature Flag: Set ENABLE_RETRY_DLQ=true to activate
 */

export {
  // Types
  type RetryPolicy,
  type DlqMetadata,
  type DlqEntry,
  type DlqQueryOptions,
  type DlqMetrics,
  type RetryDelayResult,
  type ErrorCategory,
  DEFAULT_RETRY_POLICIES,
  ERROR_CLASSIFICATION_RULES,
  FEATURE_FLAG_RETRY_DLQ,
  isRetryDlqEnabled,
  classifyError
} from './types';

export {
  // Retry Policy
  calculateRetryDelay,
  getRetryPolicy,
  shouldRetry,
  shouldMoveToDlq,
  recordRetryAttempt,
  recordDlqMove,
  getRetrySummary,
  formatRetryDelay
} from './retry-policy';

export {
  // DLQ Storage
  addToDlq,
  getDlqEntry,
  listDlqEntries,
  getDlqMetrics,
  deleteDlqEntry,
  deleteDlqEntries,
  requeueFromDlq,
  clearDlqStream,
  getAllDlqStreamKeys,
  initializeDlqConsumerGroups,
  cleanOldDlqEntries,
  getDlqStreamKey,
  getRedisClient,
  closeRedisClient,
  redisConnectionOptions
} from './dlq';

export {
  // Enhanced Worker
  startEnhancedWorker,
  stopEnhancedWorker,
  getEnhancedWorkerStatus,
  processJobEnhanced,
  createEnhancedProcessor,
  registerOriginalProcessors,
  cleanup
} from './worker';

export {
  // Maintenance utilities
  scheduleDlqCleanup,
  getDlqHealthReport,
  replayDlqEntries
} from './maintenance';

// Internal imports for use in this module
import { getRedisClient, initializeDlqConsumerGroups } from './dlq';
import { cleanup } from './worker';
import { isRetryDlqEnabled } from './types';

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the retry and DLQ system
 * Call this during application startup
 */
export async function initializeRetryDlqSystem(): Promise<void> {
  console.log('[RetryDLQ] Initializing message retry and DLQ system...');

  // Test Redis connection
  try {
    const client = await getRedisClient();
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis did not respond with PONG');
    }
    console.log('[RetryDLQ] Redis connection established');
  } catch (error) {
    console.error('[RetryDLQ] Failed to connect to Redis:', error);
    throw error;
  }

  // Initialize DLQ consumer groups
  try {
    await initializeDlqConsumerGroups();
    console.log('[RetryDLQ] DLQ consumer groups initialized');
  } catch (error) {
    console.warn('[RetryDLQ] DLQ consumer group initialization warning:', error);
  }

  const status = isRetryDlqEnabled() ? 'ENABLED' : 'DISABLED';
  console.log(`[RetryDLQ] System initialized (feature flag: ${status})`);
}

/**
 * Gracefully shutdown the retry and DLQ system
 */
export async function shutdownRetryDlqSystem(): Promise<void> {
  console.log('[RetryDLQ] Shutting down...');
  await cleanup();
  console.log('[RetryDLQ] Shutdown complete');
}
