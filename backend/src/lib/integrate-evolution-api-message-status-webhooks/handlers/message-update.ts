/**
 * Handle MESSAGES_UPDATE - Message status change (delivered, read, etc.)
 */

import { prisma } from '../../prisma';
import { getSocketService } from '../build-real-time-messaging-with-socket.io';
import { broadcastToInstance } from './utils/broadcast';
import { extractMessagePreview } from './utils/message-helpers';
import { recordStatusChangeFromReceipt } from '../../message-status-tracking/status-manager';

export async function handleMessageUpdate(
  event: { messageId: string; status: string; instanceId?: string; timestamp?: any },
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { messageId, status, instanceId } = event;

  if (!messageId || !status) {
    return { success: false, error: 'Missing required fields: messageId, status' };
  }

  try {
    const response = await recordStatusChangeFromReceipt(
      messageId,
      orgId,
      status as any,
      event.timestamp ? new Date(event.timestamp) : undefined
    );

    await broadcastToInstance(response.instanceId!, 'whatsapp:message:update', {
      id: response.messageId,
      chatId: response.chatId!,
      status: response.newStatus,
      timestamp: Date.now(),
    });

    if (response.newStatus === 'READ' && response.oldStatus !== 'READ') {
      try {
        const chatId = response.chatId;
        if (chatId && response.instanceId) {
          const message = await prisma.whatsAppMessage.findUnique({
            where: { id: response.messageId },
            select: { from: true, chatId: true },
          });

          const instance = await prisma.whatsAppInstance.findUnique({
            where: { id: response.instanceId },
            select: { phoneNumber: true, orgId: true },
          });

          const isIncoming = message && instance && message.from !== instance.phoneNumber;

          if (isIncoming) {
            await prisma.whatsAppChat.update({
              where: { id: chatId },
              data: { unreadCount: { decrement: 1 } },
            });

            const socketService = getSocketService();
            if (socketService) {
              const updatedChat = await prisma.whatsAppChat.findUnique({
                where: { id: chatId },
                select: { id: true, lastMessageAt: true, unreadCount: true, updatedAt: true },
              });
              if (updatedChat && instance.orgId) {
                const latestMessage = await prisma.whatsAppMessage.findFirst({
                  where: { chatId },
                  orderBy: { createdAt: 'desc' },
                  select: { content: true },
                });
                const lastMessagePreview = latestMessage ? extractMessagePreview(latestMessage.content) : '';
                await socketService.broadcastToOrg(instance.orgId, 'whatsapp:chat:update', {
                  chatId: updatedChat.id,
                  lastMessageAt: updatedChat.lastMessageAt?.getTime(),
                  lastMessage: lastMessagePreview,
                  unreadCount: updatedChat.unreadCount,
                  updatedAt: updatedChat.updatedAt?.getTime(),
                });
              }
            }
          }
        }
      } catch (unreadError) {
        console.warn('[MessageUpdate] Failed to decrement unreadCount:', unreadError);
      }
    }

    return { success: true, result: `Message ${response.messageId} status updated to ${status}` };
  } catch (error: any) {
    if (error.code === 'P2025' || error.message.includes('not found')) {
      console.warn(`Message ${messageId} not found for status update`);
      return { success: true, result: `Message ${messageId} not found (ignored)` };
    }
    throw error;
  }
}
