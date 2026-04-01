/**
 * Handle APPLICATION_STARTUP - Evolution API instance started
 */

import { prisma } from '../../prisma';

export async function handleApplicationStartup(
  event: { instanceId: string },
  orgId: string
): Promise<{ success: boolean; result?: string }> {
  const { instanceId } = event;
  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: { lastSeen: new Date() },
  });
  return { success: true, result: `Startup event processed` };
}
