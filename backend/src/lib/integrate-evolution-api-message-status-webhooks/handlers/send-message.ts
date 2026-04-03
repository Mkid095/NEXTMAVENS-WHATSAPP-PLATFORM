/**
 * Handle SEND_MESSAGE - Confirmation that a message was sent
 */

import { broadcastToInstance } from '../utils/broadcast';
import { updateMessageStatus } from '../../message-status-tracking/status-manager';
import { StatusChangeReason } from '../../message-status-tracking/types';

export async function handleSendMessage(
  event: { messageId: string; status: string },
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { messageId, status } = event;

  try {
    const newStatus = status === 'success' ? 'SENT' : 'FAILED';

    const response = await updateMessageStatus(messageId, orgId, {
      status: newStatus,
      reason: StatusChangeReason.WEBHOOK_UPDATE,
      changedBy: 'system',
      metadata: { eventType: 'SEND_MESSAGE', source: 'evolution-api' }
    });

    await broadcastToInstance(response.instanceId!, 'whatsapp:message:update', {
      id: response.messageId,
      chatId: response.chatId!,
      status: response.newStatus,
      timestamp: Date.now(),
    });

    return { success: true, result: `Send confirmation processed` };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: true, result: `Message not found (ignored)` };
    }
    throw error;
  }
}
