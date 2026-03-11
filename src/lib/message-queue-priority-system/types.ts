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
  LOW = 50,       // Not used currently
  BACKGROUND = 100 // Not used currently
}

/**
 * Message types that can be queued
 * Maps to priority levels for automatic routing
 */
export enum MessageType {
  MESSAGE_UPSERT = 'message_upsert',
  MESSAGE_STATUS_UPDATE = 'message_status_update',
  MESSAGE_DELETE = 'message_delete',
  INSTANCE_STATUS_UPDATE = 'instance_status_update'
}

/**
 * Base job data structure (shared fields)
 */
export interface BaseJobData {
  type: MessageType;
  timestamp: string;
  source?: string;
}

/**
 * Job data payloads for each message type
 */
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

/**
 * Union type of all supported job data
 */
export type AnyQueueJobData =
  | MessageUpsertJobData
  | MessageStatusUpdateJobData
  | MessageDeleteJobData
  | InstanceStatusUpdateJobData;

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
