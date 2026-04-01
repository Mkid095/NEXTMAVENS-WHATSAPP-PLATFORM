/**
 * Message Delete Processor
 *
 * Handles MESSAGE_DELETE jobs - removing messages from database.
 */

import type { Job } from 'bullmq';
import { prisma } from '../../prisma';
import { getSocketService } from '../../build-real-time-messaging-with-socket.io';

/**
 * Process a message delete job
 * Deletes a message and broadcasts deletion
 */
export async function processMessageDelete(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.messageId || !data.instanceId || !data.orgId) {
    throw new Error('Invalid message delete job data');
  }

  const { messageId, instanceId, orgId } = data;

  // Verify instance belongs to org
  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, orgId },
    select: { id: true }
  });

  if (!instance) {
    throw new Error(`Instance ${instanceId} not found or access denied for org ${orgId}`);
  }

  try {
    const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
    await prisma.whatsAppMessage.delete({ where: { id: messageId } });

    if (message) {
      const socketService = getSocketService();
      if (socketService) {
        await socketService.broadcastToInstance(instanceId, 'whatsapp:message:delete', {
          id: messageId,
          chatId: message.chatId,
        });
      }
    }
  } catch (error: any) {
    if (error.code === 'P2025') return; // Record not found, already deleted
    throw error;
  }
}
