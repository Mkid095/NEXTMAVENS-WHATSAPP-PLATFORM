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
  // Retry Policy Types
  type RetryPolicy,
  DEFAULT_RETRY_POLICIES
} from './retry-policy.types';

export {
  // Error Classification Types
  type ErrorCategory,
  ERROR_CLASSIFICATION_RULES,
  FEATURE_FLAG_RETRY_DLQ,
  isRetryDlqEnabled,
  classifyError
} from './error-classification.types';

export {
  // DLQ Types
  type DlqMetadata,
  type DlqEntry,
  type DlqQueryOptions,
  type DlqMetrics,
  type RetryDelayResult
} from './dlq.types';

export {
  // Retry Delay Calculation
  calculateRetryDelay,
  formatRetryDelay
} from './retry-delay.calculator';

export {
  // Retry Policy Queries
  getRetryPolicy,
  getRetrySummary
} from './retry-policy.queries';

export {
  // Retry Evaluator
  shouldRetry,
  shouldMoveToDlq
} from './retry-evaluator';

export {
  // Retry Metrics
  recordRetryAttempt,
  recordDlqMove,
  getRetryMetrics,
  resetRetryMetrics
} from './retry-metrics';

export {
  // DLQ Configuration
  getDlqStreamKey,
  DLQ_STREAM_PREFIX,
  DLQ_RETENTION_DAYS,
  DLQ_RETENTION_MS,
  DLQ_CONSUMER_GROUP,
  redisConnectionOptions
} from './dlq.config';

export {
  // DLQ Redis Client
  getRedisClient,
  closeRedisClient
} from './dlq.redis.client';

export {
  // Stream Operations
  getAllDlqStreamKeys
} from './stream.operations';

export {
  // Query Operations
  getDlqEntry,
  getDlqMetrics
} from './query.operations';

export {
  // List Operations
  listDlqEntries
} from './list.operations';

export {
  // Write Operations
  addToDlq,
  deleteDlqEntry,
  deleteDlqEntries,
  clearDlqStream
} from './write.operations';

export {
  // Requeue Operations
  requeueFromDlq
} from './requeue.operations';

export {
  // Admin Operations
  initializeDlqConsumerGroups,
  cleanOldDlqEntries
} from './admin.operations';

export {
  // Worker Processor
  processJobEnhanced,
  createEnhancedProcessor,
  registerOriginalProcessors
} from './worker.processor';

export {
  // Worker Management
  startEnhancedWorker,
  stopEnhancedWorker,
  getEnhancedWorkerStatus,
  cleanup
} from './worker.management';

export {
  // Maintenance
  scheduleDlqCleanup
} from './cleanup.scheduler';

export {
  // Health Reporting
  getDlqHealthReport
} from './health.reporter';

export {
  // Replay Operations
  replayDlqEntries
} from './replay.operations';

export {
  // Lifecycle Management
  initializeRetryDlqSystem,
  shutdownRetryDlqSystem
} from './lifecycle';
