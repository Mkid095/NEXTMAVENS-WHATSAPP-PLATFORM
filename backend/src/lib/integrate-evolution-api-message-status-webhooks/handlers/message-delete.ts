/**
 * Handle MESSAGES_DELETE - Message was deleted
 */

import { prisma } from '../../prisma';
import { broadcastToInstance } from './utils/broadcast';

export async function handleMessageDelete(
  event: { messageId: string },
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { messageId } = event;

  if (!messageId) {
    return { success: false, error: 'Missing messageId' };
  }

  try {
    const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });

    await prisma.whatsAppMessage.delete({ where: { id: messageId } });

    if (message) {
      await broadcastToInstance(message.instanceId, 'whatsapp:message:delete', {
        id: messageId,
        chatId: message.chatId,
      });
    }

    return { success: true, result: `Message ${messageId} deleted` };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: true, result: `Message ${messageId} already deleted` };
    }
    throw error;
  }
}
