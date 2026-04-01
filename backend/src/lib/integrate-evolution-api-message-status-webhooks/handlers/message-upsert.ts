/**
 * Handle MESSAGES_UPSERT - New incoming or outgoing message
 *
 * Creates the message in database. For incoming messages, also creates
 * chat if doesn't exist. For outgoing, should already have chat.
 */

import { prisma } from '../../prisma';
import { getSocketService } from '../build-real-time-messaging-with-socket.io';
import { broadcastToInstance, broadcastToOrg } from './utils/broadcast';
import { extractMessagePreview, ensureChatExists } from './utils/message-helpers';

export async function handleMessageUpsert(
  event: { messageId: string; chatId: string; from?: string; to?: string; type: string; content?: any; status?: string; instanceId: string; timestamp?: any },
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { messageId, chatId, from, to, type, content, status, instanceId } = event;

  if (!messageId || !chatId || !type) {
    return {
      success: false,
      error: 'Missing required fields: messageId, chatId, type',
    };
  }

  // Ensure chat exists first (if not, create it)
  await ensureChatExists(orgId, instanceId, chatId, from, to);

  let message;
  try {
    // Try to insert new message (idempotent: fails if exists, then we update)
    message = await prisma.whatsAppMessage.create({
      data: {
        id: messageId,
        orgId,
        instanceId,
        chatId,
        messageId, // External WhatsApp message ID
        from: from ?? 'unknown',
        to: to ?? '',
        type: type as any,
        content: (content ?? null) as any,
        status: (status ?? 'PENDING') as any,
        sentAt: content?.messageTimestamp
          ? new Date(content.messageTimestamp as string)
          : null,
      },
    });

    // Broadcast to connected clients
    await broadcastToInstance(instanceId, 'whatsapp:message:upsert', {
      id: message.id,
      chatId: message.chatId,
      messageId: message.messageId,
      from: message.from,
      to: message.to,
      type: message.type,
      content: message.content,
      status: message.status,
      timestamp: message.sentAt?.getTime() || Date.now(),
    });

    // Update chat metadata: lastMessageAt and unreadCount
    try {
      const instance = await prisma.whatsAppInstance.findUnique({
        where: { id: instanceId },
        select: { phoneNumber: true },
      });

      const isIncoming = instance && message.from !== instance.phoneNumber;
      const shouldIncrementUnread = isIncoming && message.status !== 'READ' && message.status !== 'FAILED';

      const chatUpdateData: any = {
        lastMessageAt: new Date(),
      };
      if (shouldIncrementUnread) {
        chatUpdateData.unreadCount = { increment: 1 };
      }

      await prisma.whatsAppChat.update({
        where: { id: chatId },
        data: chatUpdateData,
      });

      const socketService = getSocketService();
      if (socketService) {
        const updatedChat = await prisma.whatsAppChat.findUnique({
          where: { id: chatId },
          select: { id: true, lastMessageAt: true, unreadCount: true, updatedAt: true },
        });
        if (updatedChat) {
          const instanceWithOrg = await prisma.whatsAppInstance.findUnique({
            where: { id: instanceId },
            select: { orgId: true },
          });
          if (instanceWithOrg) {
            const lastMessagePreview = extractMessagePreview(message.content);
            await socketService.broadcastToOrg(instanceWithOrg.orgId, 'whatsapp:chat:update', {
              chatId: updatedChat.id,
              lastMessageAt: updatedChat.lastMessageAt?.getTime(),
              lastMessage: lastMessagePreview,
              unreadCount: updatedChat.unreadCount,
              updatedAt: updatedChat.updatedAt?.getTime(),
            });
          }
        }
      }
    } catch (chatError) {
      console.warn('[MessageUpsert] Failed to update chat metadata:', chatError);
    }

    return { success: true, result: `Message ${messageId} created` };
  } catch (error: any) {
    if (error.code === 'P2002') {
      const existing = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
      if (!existing) {
        throw new Error(`Message ${messageId} claimed duplicate but not found`);
      }

      message = await prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: status as any,
          content: (content ?? undefined) as any,
          sentAt: content?.messageTimestamp
            ? new Date(content.messageTimestamp as string)
            : undefined,
        },
      });

      await broadcastToInstance(instanceId, 'whatsapp:message:upsert', {
        id: message.id,
        chatId: message.chatId,
        messageId: message.messageId,
        from: message.from,
        to: message.to,
        type: message.type,
        content: message.content,
        status: message.status,
        timestamp: message.sentAt?.getTime() || Date.now(),
      });

      return { success: true, result: `Message ${messageId} updated` };
    }

    throw error;
  }
}
