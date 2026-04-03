/**
 * Handle CONNECTION_UPDATE - Instance connection status changed
 */

import { prisma } from '../../prisma';
import { broadcastToOrg } from '../utils/broadcast';

export async function handleConnectionUpdate(
  event: { instanceId: string; message?: string },
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { message } = event;
  const statusMatch = message?.match(/status changed to: (\w+)/);
  const newStatus = statusMatch?.[1] ?? 'UNKNOWN';

  const statusMap: Record<string, string> = {
    connected: 'CONNECTED',
    connecting: 'CONNECTING',
    disconnected: 'DISCONNECTED',
    error: 'ERROR',
  };
  const prismaStatus = statusMap[newStatus.toLowerCase()] ?? 'DISCONNECTED';

  await prisma.whatsAppInstance.update({
    where: { id: event.instanceId },
    data: { status: prismaStatus as any, lastSeen: new Date() },
  });

  await broadcastToOrg(orgId, 'whatsapp:instance:status', {
    instanceId: event.instanceId,
    status: prismaStatus,
    timestamp: Date.now(),
  });

  return { success: true, result: `Instance ${event.instanceId} status set to ${prismaStatus}` };
}
