/**
 * Message Upsert Processor
 *
 * Handles MESSAGE_UPSERT jobs - creating or updating WhatsApp messages.
 */

import type { Job } from 'bullmq';
import type { MessageStatus, MessageType } from '@prisma/client';
import { prisma } from '../../prisma';
import { getSocketService } from '../../build-real-time-messaging-with-socket.io';
import { createStatusHistoryEntry } from '../../message-status-tracking/status-manager';
import { StatusChangeReason } from '../../message-status-tracking/types';

/**
 * Process a message upsert job
 * Creates or updates a message in the database and broadcasts via WebSocket
 */
export async function processMessageUpsert(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.messageId || !data.chatId || !data.instanceId || !data.orgId) {
    throw new Error('Invalid message upsert job data');
  }

  const { messageId, chatId, instanceId, orgId, from, to, type, content, status, timestamp } = data;
  let finalStatus: MessageStatus;

  // Ensure chat exists
  await ensureChatExists(orgId, instanceId, chatId, from, to);

  try {
    await prisma.whatsAppMessage.create({
      data: {
        id: messageId,
        orgId,
        instanceId,
        chatId,
        messageId,
        from: from ?? 'unknown',
        to: to ?? '',
        type: type as MessageType,
        content: content ?? null,
        status: (status ?? 'PENDING') as MessageStatus,
        sentAt: timestamp ? new Date(timestamp) : new Date(),
      },
    });
    finalStatus = (status ?? 'PENDING') as MessageStatus;

    // Broadcast via WebSocket
    const socketService = getSocketService();
    if (socketService) {
      await socketService.broadcastToInstance(instanceId, 'whatsapp:message:upsert', {
        messageId,
        chatId,
        from,
        to,
        type,
        content,
        status: finalStatus,
        timestamp: timestamp ? new Date(timestamp).getTime() : Date.now(),
      });
    }
  } catch (error: any) {
    if (error.code === 'P2002') {
      // Duplicate key - update existing message
      const existing = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
      if (!existing) throw new Error(`Message ${messageId} claimed duplicate but not found`);

      const newStatus = (status ?? existing.status) as MessageStatus;
      await prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: newStatus,
          content: content ?? undefined,
          sentAt: timestamp ? new Date(timestamp) : undefined,
        },
      });
      finalStatus = newStatus;

      const socketService = getSocketService();
      if (socketService) {
        await socketService.broadcastToInstance(instanceId, 'whatsapp:message:upsert', {
          messageId,
          chatId,
          from,
          to,
          type,
          content,
          status: finalStatus,
          timestamp: timestamp ? new Date(timestamp).getTime() : existing.sentAt?.getTime() ?? Date.now(),
        });
      }
    } else {
      throw error;
    }
  }

  // Record status history for audit trail
  await createStatusHistoryEntry(messageId, orgId, finalStatus, StatusChangeReason.QUEUE_PROCESSING, 'system', {
    jobId: job.id,
    jobName: job.name as string,
    source: 'message-queue'
  });

  // Update chat metadata and broadcast
  try {
    await prisma.whatsAppChat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date(),
      },
    });

    const socketService = getSocketService();
    if (socketService) {
      await socketService.broadcastToInstance(instanceId, 'whatsapp:chat:update', {
        chatId,
        lastMessageAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  } catch (chatError) {
    console.warn('[MessageUpsertProcessor] Failed to update chat metadata:', chatError.message);
    // Don't fail the job if chat update fails
  }
}

/**
 * Helper: Ensure chat exists before processing message
 */
async function ensureChatExists(
  orgId: string,
  instanceId: string,
  chatId: string,
  from?: string,
  to?: string
): Promise<void> {
  try {
    const phone = from?.endsWith('@c.us') ? from : to;
    if (!phone) throw new Error('Cannot determine chat phone number');

    await prisma.whatsAppChat.upsert({
      where: { id: chatId },
      update: {},
      create: { id: chatId, orgId, instanceId, chatId, phone }
    });
  } catch (error: any) {
    if (error.code !== 'P2002') throw error; // P2002 = duplicate key, chat already exists
  }
}
