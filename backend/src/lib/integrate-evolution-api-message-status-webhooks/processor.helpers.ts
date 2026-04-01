/**
 * Processor Helpers
 *
 * Helper functions for webhook processing (instance lookup, RLS context).
 */

import { prisma } from '../prisma';

/**
 * Look up WhatsApp instance and return its orgId
 *
 * Uses SUPER_ADMIN bypass to access all instances.
 */
export async function getInstanceInfo(
  instanceId: string
): Promise<{ id: string; orgId: string; status: string; webhookUrl?: string } | null> {
  try {
    await prisma.$executeRaw`
      SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)
    `;
    await prisma.$executeRaw`
      SELECT set_config('app.current_org', NULL, false)
    `;

    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, orgId: true, status: true, webhookUrl: true },
    });

    return instance ?? null;
  } catch (error) {
    console.error(`Error looking up instance ${instanceId}:`, error);
    return null;
  }
}

/**
 * Set database RLS context to the specified org
 *
 * All subsequent queries will be scoped to this org automatically.
 */
export async function setRlsContext(orgId: string): Promise<void> {
  await prisma.$executeRaw`
    SELECT set_config('app.current_org', ${orgId}, false)
  `;
  await prisma.$executeRaw`
    SELECT set_config('app.current_user_role', 'API_USER', false)
  `;
}
