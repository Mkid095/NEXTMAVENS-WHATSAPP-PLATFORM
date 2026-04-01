/**
 * Instance Status Update Processor
 *
 * Handles INSTANCE_STATUS_UPDATE jobs - updating WhatsApp instance status.
 */

import type { Job } from 'bullmq';
import { prisma } from '../../prisma';
import { getSocketService } from '../../build-real-time-messaging-with-socket.io';
import type { PrismaInstanceStatus } from '@prisma/client';

/**
 * Process an instance status update job
 * Updates WhatsApp instance status and broadcasts to org
 */
export async function processInstanceStatusUpdate(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.instanceId || !data.status || !data.orgId) {
    throw new Error('Invalid instance status update job data');
  }

  const { instanceId, status, orgId } = data;

  // Verify instance belongs to org
  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, orgId },
    select: { id: true }
  });

  if (!instance) {
    throw new Error(`Instance ${instanceId} not found or access denied for org ${orgId}`);
  }

  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: {
      status: status.toUpperCase() as PrismaInstanceStatus,
      lastSeen: new Date()
    }
  });

  const socketService = getSocketService();
  if (socketService) {
    await socketService.broadcastToOrg(orgId, 'whatsapp:instance:status', {
      instanceId,
      status: status.toUpperCase(),
      timestamp: Date.now(),
    });
  }
}
