/**
 * Message Queue Priority System - Type Exports
 *
 * Consolidated barrel for all type definitions in the system.
 * This module exists to provide a single import path for shared types.
 */

// Re-export enums (runtime values) and functions
export {
  MessagePriority,
  MessageType,
  getPriorityForType,
  PRIORITY_MAPPING,
} from './enums';

// Re-export base types (type-only)
export type { BaseJobData } from './base.types';

// Re-export message job types (type-only)
export type {
  MessageUpsertJobData,
  MessageStatusUpdateJobData,
  MessageDeleteJobData,
} from './message.types';

// Re-export instance & contact job types (type-only)
export type {
  InstanceStatusUpdateJobData,
  ContactUpdateJobData,
} from './instance.contact.types';

// Re-export analytics & webhook job types (type-only)
export type {
  AnalyticsEventJobData,
  WebhookEventJobData,
} from './analytics.webhook.types';

// Re-export maintenance job types (type-only)
export type {
  DatabaseCleanupJobData,
  CacheRefreshJobData,
} from './maintenance.types';

// Re-export union types and aliases (type-only)
export type {
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
  CacheRefreshJob,
} from './union.types';

// Re-export Job type from BullMQ (type-only)
import type { Job } from 'bullmq';
export type { Job };
