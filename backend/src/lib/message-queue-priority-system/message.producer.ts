/**
 * Message Queue Producer - Message Operations
 * Queues message-related jobs
 */

import { addJob } from './operations';
import { MessageType, MessagePriority } from './enums';

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
