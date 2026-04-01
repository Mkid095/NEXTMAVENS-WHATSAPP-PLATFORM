/**
 * Message Queue Priority System - Main Module
 * Priority-based message queuing with BullMQ
 *
 * Exports:
 * - Queue configuration: redisConnectionOptions, QUEUE_NAME, DEFAULT_CONCURRENCY
 * - Operations: addJob, addCriticalJob, addBackgroundJob
 * - Metrics: getQueueMetrics, cleanOldJobs
 * - Control: pauseQueue, resumeQueue, shutdownQueue
 * - Health: validateRedisConnection
 * - Enums: MessagePriority, MessageType, getPriorityForType
 * - Job data types: all job payload interfaces and unions
 * - Validators: validation functions
 * - Worker management: startWorker, stopWorker, getWorkerStatus
 *
 * Architecture:
 * - config.ts: Redis options and queue constants
 * - enums.ts: Priority and message type enums
 * - base.types.ts: BaseJobData
 * - message.types.ts: Message* job data
 * - instance.contact.types.ts: Instance* and Contact* job data
 * - analytics.webhook.types.ts: Analytics* and Webhook* job data
 * - maintenance.types.ts: DatabaseCleanup*, CacheRefresh*
 * - union.types.ts: AnyQueueJobData, AnyQueueJob, QueueMetrics, type aliases
 * - validators.ts: Job validation functions
 * - retry-helpers.ts: Retry policy loaders
 * - queue.instance.ts: BullMQ queue instance
 * - operations.ts: addJob, addCriticalJob, addBackgroundJob
 * - metrics.operations.ts: getQueueMetrics, cleanOldJobs
 * - control.operations.ts: pauseQueue, resumeQueue, shutdownQueue
 * - health.ts: validateRedisConnection
 *
 * All files under 150 lines.
 */

// Configuration
export {
  redisConnectionOptions,
  QUEUE_NAME,
  DEFAULT_CONCURRENCY,
  ENABLE_RETRY_DLQ,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY,
  MAX_RETRY_DELAY
} from './config';

// Enums and priority mapping
export {
  MessagePriority,
  MessageType,
  getPriorityForType
} from './enums';

// Base types
export { BaseJobData } from './base.types';

// Message job types
export {
  MessageUpsertJobData,
  MessageStatusUpdateJobData,
  MessageDeleteJobData
} from './message.types';

// Message producer functions
export {
  queueMessageUpsert,
  queueMessageStatusUpdate,
  queueMessageDelete
} from './message.producer';

// Instance & Contact job types
export {
  InstanceStatusUpdateJobData,
  ContactUpdateJobData
} from './instance.contact.types';

// Instance & Contact producer functions
export {
  queueInstanceStatusUpdate,
  queueContactUpdate
} from './instance.producer';

// Analytics & Webhook job types
export {
  AnalyticsEventJobData,
  WebhookEventJobData
} from './analytics.webhook.types';

// Analytics & Webhook producer functions
export {
  queueAnalyticsEvent,
  queueCriticalAlert
} from './analytics.producer';

// Maintenance job types
export {
  DatabaseCleanupJobData,
  CacheRefreshJobData
} from './maintenance.types';

// Maintenance producer functions
export {
  queueDatabaseCleanup,
  queueCacheRefresh
} from './maintenance.producer';

// Union types and aliases
export {
  AnyQueueJobData,
  AnyQueueJob,
  QueueMetrics,
  MessageUpsertJob,
  MessageStatusUpdateJob,
  MessageDeleteJob,
  InstanceStatusUpdateJob,
  ContactUpdateJob,
  AnalyticsEventJob,
  WebhookEventJob,
  DatabaseCleanupJob,
  CacheRefreshJob
} from './union.types';

// Validators
export {
  validateMessageStatusUpdate,
  validateInstanceStatusUpdate,
  validateMessageUpsert,
  validateMessageDelete,
  validateContactUpdate,
  validateAnalyticsEvent
} from './validators';

// Operations
export {
  addJob,
  addCriticalJob,
  addBackgroundJob
} from './operations';

// Metrics & maintenance
export {
  getQueueMetrics,
  cleanOldJobs
} from './metrics.operations';

// Control
export {
  pauseQueue,
  resumeQueue,
  shutdownQueue
} from './control.operations';

// Health
export {
  validateRedisConnection
} from './health';

// Worker management
export {
  startWorker,
  stopWorker,
  getWorkerStatus
} from './worker.manager';

// Queue instance
export { messageQueue } from './queue.instance';
