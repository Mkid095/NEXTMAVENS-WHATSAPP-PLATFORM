/**
 * Message Queue Priority System - Message Job Types
 * Job data for message-related operations
 */

import type { MessageType } from './enums';
import type { BaseJobData } from './base.types';

/**
 * Job data for message upsert (create/update)
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

/**
 * Job data for message status updates
 */
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

/**
 * Job data for message deletion
 */
export interface MessageDeleteJobData extends BaseJobData {
  type: MessageType.MESSAGE_DELETE;
  payload: {
    messageId: string;
    instanceId: string;
    orgId: string;
    chatId?: string;
  };
}
