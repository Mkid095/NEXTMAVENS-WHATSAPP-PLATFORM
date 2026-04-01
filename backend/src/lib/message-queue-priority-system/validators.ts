/**
 * Message Queue Priority System - Validators
 * Validation functions for job data structures
 */

import { MessageType } from './enums';

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
