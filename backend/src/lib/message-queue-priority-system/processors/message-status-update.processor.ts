/**
 * Message Status Update Processor
 *
 * Handles MESSAGE_STATUS_UPDATE jobs - updating message status.
 */

import type { Job } from 'bullmq';
import type { PrismaMessageStatus } from '@prisma/client';
import { prisma } from '../../prisma';
import { getSocketService } from '../../build-real-time-messaging-with-socket.io';
import { createStatusHistoryEntry } from '../../message-status-tracking/status-manager';
import { StatusChangeReason } from '../../message-status-tracking/types';

/**
 * Process a message status update job
 * Updates the status of an existing message and broadcasts the change
 */
export async function processMessageStatusUpdate(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.messageId || !data.status || !data.instanceId || !data.chatId || !data.orgId) {
    throw new Error('Invalid message status update job data');
  }

  const { messageId, status, instanceId, chatId, orgId } = data;
  const newStatus = status as PrismaMessageStatus;

  // Verify instance belongs to org
  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, orgId },
    select: { id: true }
  });

  if (!instance) {
    throw new Error(`Instance ${instanceId} not found or access denied for org ${orgId}`);
  }

  // Upsert message status
  await prisma.whatsAppMessage.upsert({
    where: { id: messageId },
    update: { status: newStatus },
    create: {
      id: messageId,
      orgId,
      instanceId,
      chatId,
      messageId,
      from: 'unknown',
      to: '',
      type: 'text',
      status: newStatus,
      content: '',
      sentAt: new Date()
    }
  });

  // Broadcast via WebSocket
  const socketService = getSocketService();
  if (socketService) {
    await socketService.broadcastToInstance(instanceId, 'whatsapp:message:update', {
      messageId,
      status: newStatus,
      instanceId,
      chatId,
      orgId,
    });
  }

  // Record status history for audit trail
  await createStatusHistoryEntry(messageId, orgId, newStatus, StatusChangeReason.QUEUE_PROCESSING, 'system', {
    jobId: job.id,
    jobName: job.name as string,
    source: 'message-queue'
  });
}
