/**
 * Socket.IO Utilities
 *
 * Helper functions for emitting status change events.
 */

import { MessageStatus, StatusChangeReason } from '../types';

let socketService: any = null;

/**
 * Set the Socket.IO service for real-time notifications
 */
export function setSocketService(service: any): void {
  socketService = service;
}

/**
 * Emit status change event to Socket.IO subscribers
 */
export async function emitStatusChangeEvent(event: {
  messageId: string;
  orgId: string;
  instanceId?: string;
  chatId?: string;
  oldStatus: MessageStatus;
  newStatus: MessageStatus;
  timestamp: Date;
  changedBy: string | null;
  reason: StatusChangeReason;
  metadata?: Record<string, any>;
}): Promise<void> {
  if (!socketService) {
    return;
  }

  try {
    // Broadcast to organization room
    await socketService.broadcastToOrg(event.orgId, 'message:status:changed', {
      messageId: event.messageId,
      instanceId: event.instanceId,
      chatId: event.chatId,
      oldStatus: event.oldStatus,
      newStatus: event.newStatus,
      timestamp: event.timestamp.getTime(),
      changedBy: event.changedBy,
      reason: event.reason,
      ...event.metadata
    });

    // Also broadcast to specific instance if available
    if (event.instanceId) {
      await socketService.broadcastToInstance(event.instanceId, 'message:status:changed', {
        messageId: event.messageId,
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        timestamp: event.timestamp.getTime(),
        reason: event.reason
      });
    }
  } catch (error) {
    console.warn('[SocketUtils] Socket emit failed:', error);
  }
}
