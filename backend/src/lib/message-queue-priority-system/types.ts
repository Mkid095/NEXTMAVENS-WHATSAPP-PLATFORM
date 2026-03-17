/**
 * Message Queue Priority System - Type Definitions
 * Core types for priority message queuing
 */

/**
 * Priority levels for message processing
 * Lower number = higher priority
 */
export enum MessagePriority {
  CRITICAL = 1,   // System alerts, security events
  HIGH = 5,       // Instance status changes
  MEDIUM = 10,    // Message operations
  LOW = 50,       // Analytics and low-priority events
  BACKGROUND = 100 // Maintenance tasks
}

/**
 * Message types that can be queued
 * Maps to priority levels for automatic routing
 */
export enum MessageType {
  MESSAGE_UPSERT = 'message_upsert',
  MESSAGE_STATUS_UPDATE = 'message_status_update',
  MESSAGE_DELETE = 'message_delete',
  INSTANCE_STATUS_UPDATE = 'instance_status_update',
  CONTACT_UPDATE = 'contact_update',
  ANALYTICS_EVENT = 'analytics_event',
  WEBHOOK_EVENT = 'webhook_event',
  DATABASE_CLEANUP = 'database_cleanup',
  CACHE_REFRESH = 'cache_refresh',
  WORKFLOW_STEP = 'workflow_step'
}

// Priority mapping for each message type
export const PRIORITY_MAPPING: Record<MessageType, MessagePriority> = {
  [MessageType.MESSAGE_UPSERT]: MessagePriority.MEDIUM,
  [MessageType.MESSAGE_STATUS_UPDATE]: MessagePriority.HIGH,
  [MessageType.MESSAGE_DELETE]: MessagePriority.MEDIUM,
  [MessageType.INSTANCE_STATUS_UPDATE]: MessagePriority.HIGH,
  [MessageType.CONTACT_UPDATE]: MessagePriority.MEDIUM,
  [MessageType.ANALYTICS_EVENT]: MessagePriority.LOW,
  [MessageType.WEBHOOK_EVENT]: MessagePriority.LOW,
  [MessageType.DATABASE_CLEANUP]: MessagePriority.BACKGROUND,
  [MessageType.CACHE_REFRESH]: MessagePriority.BACKGROUND,
  [MessageType.WORKFLOW_STEP]: MessagePriority.MEDIUM
};

export function getPriorityForType(type: MessageType): MessagePriority {
  return PRIORITY_MAPPING[type] ?? MessagePriority.MEDIUM;
}

/**
 * Base job data structure (shared fields)
 */
export interface BaseJobData {
  type: MessageType;
  timestamp?: string;
  source?: string;
}

/**
 * Job data payloads for each message type
 */

// Core message types
export interface MessageUpsertJobData extends BaseJobData {
  type: MessageType.MESSAGE_UPSERT;
  payload: {
    messageId: string;
    chatId: string;
    instanceId: string;
    orgId: string;
    from?: string;
    to?: string;
    type: string;
    content?: unknown;
    status?: string;
    timestamp?: string;
  };
}

export interface MessageStatusUpdateJobData extends BaseJobData {
  type: MessageType.MESSAGE_STATUS_UPDATE;
  payload: {
    messageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    instanceId: string;
    chatId: string;
    orgId: string;
  };
}

export interface MessageDeleteJobData extends BaseJobData {
  type: MessageType.MESSAGE_DELETE;
  payload: {
    messageId: string;
    instanceId: string;
    orgId: string;
    chatId?: string;
  };
}

export interface InstanceStatusUpdateJobData extends BaseJobData {
  type: MessageType.INSTANCE_STATUS_UPDATE;
  payload: {
    instanceId: string;
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    orgId: string;
  };
}

// Extended message types
export interface ContactUpdateJobData extends BaseJobData {
  type: MessageType.CONTACT_UPDATE;
  payload: {
    contactId: string;
    instanceId: string;
    orgId: string;
    changes: {
      name?: string;
      phone?: string;
      [key: string]: unknown;
    };
  };
}

export interface AnalyticsEventJobData extends BaseJobData {
  type: MessageType.ANALYTICS_EVENT;
  payload: {
    eventName: string;
    properties: Record<string, unknown>;
    userId?: string;
    orgId?: string;
    timestamp?: string;
  };
}

export interface WebhookEventJobData extends BaseJobData {
  type: MessageType.WEBHOOK_EVENT;
  payload: {
    webhookId: string;
    event: string;
    payload: unknown;
    timestamp?: string;
  };
}

export interface DatabaseCleanupJobData extends BaseJobData {
  type: MessageType.DATABASE_CLEANUP;
  payload: {
    olderThanDays: number;
    tables: string[];
    orgId?: string;
  };
}

export interface CacheRefreshJobData extends BaseJobData {
  type: MessageType.CACHE_REFRESH;
  payload: {
    cacheKey: string;
    refreshFunction: string;
    ttl?: number;
    orgId?: string;
  };
}

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

// Import Job type from BullMQ
import type { Job } from 'bullmq';

// ============================================================================
// Type Aliases for Job Types (for test compatibility)
// ============================================================================

export type MessageUpsertJob = MessageUpsertJobData;
export type MessageStatusUpdateJob = MessageStatusUpdateJobData;
export type MessageDeleteJob = MessageDeleteJobData;
export type InstanceStatusUpdateJob = InstanceStatusUpdateJobData;
export type ContactUpdateJob = ContactUpdateJobData;
export type AnalyticsEventJob = AnalyticsEventJobData;
export type WebhookEventJob = WebhookEventJobData;
export type DatabaseCleanupJob = DatabaseCleanupJobData;
export type CacheRefreshJob = CacheRefreshJobData;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a message status update job
 */
export function validateMessageStatusUpdate(job: any): boolean {
  if (!job || typeof job !== 'object') return false;
  if (job.type !== MessageType.MESSAGE_STATUS_UPDATE) return false;
  const payload = job.payload;
  if (!payload || typeof payload !== 'object') return false;
  const required = ['messageId', 'status', 'instanceId', 'chatId', 'orgId'];
  for (const field of required) {
    if (payload[field] === undefined) return false;
  }
  const validStatuses = ['sent', 'delivered', 'read', 'failed'];
  return validStatuses.includes(payload.status);
}

/**
 * Validate an instance status update job
 */
export function validateInstanceStatusUpdate(job: any): boolean {
  if (!job || typeof job !== 'object') return false;
  if (job.type !== MessageType.INSTANCE_STATUS_UPDATE) return false;
  const payload = job.payload;
  if (!payload || typeof payload !== 'object') return false;
  const required = ['instanceId', 'status', 'orgId'];
  for (const field of required) {
    if (payload[field] === undefined) return false;
  }
  const validStatuses = ['connecting', 'connected', 'disconnected', 'error'];
  return validStatuses.includes(payload.status);
}

/**
 * Validate a message upsert job
 */
export function validateMessageUpsert(job: any): boolean {
  if (!job || typeof job !== 'object') return false;
  if (job.type !== MessageType.MESSAGE_UPSERT) return false;
  const payload = job.payload;
  if (!payload || typeof payload !== 'object') return false;
  const required = ['messageId', 'chatId', 'instanceId', 'orgId'];
  for (const field of required) {
    if (payload[field] === undefined) return false;
  }
  return true;
}

/**
 * Validate a message delete job
 */
export function validateMessageDelete(job: any): boolean {
  if (!job || typeof job !== 'object') return false;
  if (job.type !== MessageType.MESSAGE_DELETE) return false;
  const payload = job.payload;
  if (!payload || typeof payload !== 'object') return false;
  const required = ['messageId', 'instanceId', 'orgId'];
  for (const field of required) {
    if (payload[field] === undefined) return false;
  }
  return true;
}

/**
 * Validate a contact update job
 */
export function validateContactUpdate(job: any): boolean {
  if (!job || typeof job !== 'object') return false;
  if (job.type !== MessageType.CONTACT_UPDATE) return false;
  const payload = job.payload;
  if (!payload || typeof payload !== 'object') return false;
  const required = ['contactId', 'instanceId', 'orgId', 'changes'];
  for (const field of required) {
    if (payload[field] === undefined) return false;
  }
  if (typeof payload.changes !== 'object' || payload.changes === null) return false;
  return true;
}

/**
 * Validate an analytics event job
 */
export function validateAnalyticsEvent(job: any): boolean {
  if (!job || typeof job !== 'object') return false;
  if (job.type !== MessageType.ANALYTICS_EVENT) return false;
  const payload = job.payload;
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.eventName !== 'string') return false;
  if (typeof payload.properties !== 'object' || payload.properties === null) return false;
  return true;
}
