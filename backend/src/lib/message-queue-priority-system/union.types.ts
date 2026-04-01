/**
 * Message Queue Priority System - Union Types and Aliases
 */

import type { Job } from 'bullmq';
import type { MessageUpsertJobData } from './message.types';
import type { MessageStatusUpdateJobData } from './message.types';
import type { MessageDeleteJobData } from './message.types';
import type { InstanceStatusUpdateJobData } from './instance.contact.types';
import type { ContactUpdateJobData } from './instance.contact.types';
import type { AnalyticsEventJobData } from './analytics.webhook.types';
import type { WebhookEventJobData } from './analytics.webhook.types';
import type { DatabaseCleanupJobData } from './maintenance.types';
import type { CacheRefreshJobData } from './maintenance.types';

/**
 * Union type of all supported job data
 */
export type AnyQueueJobData =
  | MessageUpsertJobData
  | MessageStatusUpdateJobData
  | MessageDeleteJobData
  | InstanceStatusUpdateJobData
  | ContactUpdateJobData
  | AnalyticsEventJobData
  | WebhookEventJobData
  | DatabaseCleanupJobData
  | CacheRefreshJobData;

/**
 * BullMQ Job wrapper (using generic)
 */
export type AnyQueueJob = Job<AnyQueueJobData>;

/**
 * Queue metrics for monitoring
 */
export interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  priorityRanges: Record<string, number>;
}

// Type Aliases for Job Types (for test compatibility)
export type MessageUpsertJob = MessageUpsertJobData;
export type MessageStatusUpdateJob = MessageStatusUpdateJobData;
export type MessageDeleteJob = MessageDeleteJobData;
export type InstanceStatusUpdateJob = InstanceStatusUpdateJobData;
export type ContactUpdateJob = ContactUpdateJobData;
export type AnalyticsEventJob = AnalyticsEventJobData;
export type WebhookEventJob = WebhookEventJobData;
export type DatabaseCleanupJob = DatabaseCleanupJobData;
export type CacheRefreshJob = CacheRefreshJobData;
