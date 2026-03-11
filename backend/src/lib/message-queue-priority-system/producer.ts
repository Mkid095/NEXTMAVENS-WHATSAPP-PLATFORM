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
  return await addJob(MessageType.MESSAGE_UPSERT, { ...data });
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
 * Utility: get priority for a message type
 */
export function getPriorityForMessageType(type: MessageType): MessagePriority {
  return getPriorityForType(type);
}
