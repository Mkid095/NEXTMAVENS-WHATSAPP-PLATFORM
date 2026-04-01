/**
 * Status Update DTO Types
 * Request/Response and event types
 */

import { MessageStatus } from '@prisma/client';

/**
 * Request to update message status
 */
export interface StatusUpdateRequest {
  status: MessageStatus;
  reason?: string;
  changedBy?: string;      // User ID (defaults to 'system' if not provided)
  metadata?: Record<string, any>;
}

/**
 * Response after status update
 */
export interface StatusUpdateResponse {
  success: boolean;
  messageId: string;
  oldStatus: MessageStatus;
  newStatus: MessageStatus;
  historyEntryId: string;
  timestamp: Date;
  // Additional fields for integration with other systems
  instanceId?: string;
  chatId?: string;
  orgId?: string;
}

/**
 * Socket.IO event for status changes
 */
export interface StatusChangeEvent {
  type: 'message:status:changed';
  data: {
    messageId: string;
    orgId: string;
    instanceId?: string;
    chatId?: string;
    oldStatus: MessageStatus;
    newStatus: MessageStatus;
    timestamp: Date;
    changedBy: string | null;
    reason: string;
    metadata?: Record<string, any>;
  };
}
