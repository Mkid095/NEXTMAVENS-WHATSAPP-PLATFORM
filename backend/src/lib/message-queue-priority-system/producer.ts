/**
 * Message Queue Producer
 * Enqueue functions for each message type
 */

import {
  addJob,
  addCriticalJob,
  addBackgroundJob,
  getPriorityForType
} from './index';
import { MessageType, MessagePriority } from './types';

/**
 * Queue a message upsert
 * Priority: MEDIUM
 * Deduplication: Enabled (1 hour throttle)
 */
export async function queueMessageUpsert(data: {
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
}): Promise<any> {
  return await addJob(MessageType.MESSAGE_UPSERT, { ...data }, {
    deduplication: {
      enabled: true,
      ttl: 60 * 60 * 1000, // 1 hour
      extend: true
    }
  });
}

/**
 * Queue a message status update
 * Priority: HIGH
 */
export async function queueMessageStatusUpdate(data: {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  instanceId: string;
  chatId: string;
  orgId: string;
  timestamp?: string;
}): Promise<any> {
  return await addJob(MessageType.MESSAGE_STATUS_UPDATE, { ...data });
}

/**
 * Queue a message deletion
 * Priority: MEDIUM
 */
export async function queueMessageDelete(data: {
  messageId: string;
  instanceId: string;
  orgId: string;
  chatId?: string;
}): Promise<any> {
  return await addJob(MessageType.MESSAGE_DELETE, { ...data });
}

/**
 * Queue an instance status update
 * Priority: HIGH
 */
export async function queueInstanceStatusUpdate(data: {
  instanceId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  orgId: string;
}): Promise<any> {
  return await addJob(MessageType.INSTANCE_STATUS_UPDATE, { ...data });
}

/**
 * Queue a contact update
 * Priority: MEDIUM
 */
export async function queueContactUpdate(data: {
  contactId: string;
  instanceId: string;
  orgId: string;
  changes: Record<string, unknown>;
}): Promise<any> {
  return await addJob(MessageType.CONTACT_UPDATE, { ...data });
}

/**
 * Queue an analytics event
 * Priority: LOW
 */
export async function queueAnalyticsEvent(data: {
  eventName: string;
  properties: Record<string, unknown>;
  userId?: string;
  orgId?: string;
  timestamp?: string;
}): Promise<any> {
  return await addJob(MessageType.ANALYTICS_EVENT, { ...data });
}

/**
 * Queue a critical alert (uses ANALYTICS_EVENT with CRITICAL priority)
 */
export async function queueCriticalAlert(data: {
  alertType: string;
  message: string;
  severity: string;
  metadata: Record<string, unknown>;
}): Promise<any> {
  return await addJob(MessageType.ANALYTICS_EVENT, {
    eventName: 'critical_alert',
    properties: {
      alertType: data.alertType,
      message: data.message,
      severity: data.severity,
      ...data.metadata
    }
  }, { priority: MessagePriority.CRITICAL });
}

/**
 * Queue a database cleanup task
 * Priority: BACKGROUND
 */
export async function queueDatabaseCleanup(data: {
  olderThanDays: number;
  tables: string[];
  orgId?: string;
}): Promise<any> {
  return await addJob(MessageType.DATABASE_CLEANUP, { ...data });
}

/**
 * Queue a cache refresh task
 * Priority: BACKGROUND
 */
export async function queueCacheRefresh(data: {
  cacheKey: string;
  refreshFunction: string;
  ttl?: number;
  orgId?: string;
}): Promise<any> {
  return await addJob(MessageType.CACHE_REFRESH, { ...data });
}

/**
 * Utility: get priority for a message type
 */
export function getPriorityForMessageType(type: MessageType): MessagePriority {
  return getPriorityForType(type);
}
