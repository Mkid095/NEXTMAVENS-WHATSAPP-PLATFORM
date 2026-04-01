/**
 * Evolution Instance Management Helpers
 *
 * Shared logic for provisioning and managing Evolution instances
 * Used by connection handlers
 */

import { getEvolutionClient } from '../../../lib/evolution-api-client/instance';
import { prisma } from '../../../lib/prisma';

/**
 * Provisions an Evolution instance if it doesn't exist
 * - Creates instance in Evolution API
 * - Configures webhook
 * - Updates DB with evolutionInstanceName
 *
 * Returns the Evolution instance name
 */
export async function provisionEvolutionInstance(
  instanceId: string,
  appUrl: string
): Promise<string> {
  const evo = getEvolutionClient();

  // Use our internal instance ID as the Evolution instance name
  const evolutionInstanceName = instanceId;

  // Create instance in Evolution API (or verify it exists)
  try {
    const createdInstance = await evo.createInstance(evolutionInstanceName);
    console.log(`[Provision] Created Evolution instance:`, createdInstance.instanceName);
  } catch (error: any) {
    // If instance already exists in Evolution, that's okay - we can proceed
    if (error.message?.toLowerCase().includes('already exists') ||
        error.code === '409' ||
        error.httpStatus === 409) {
      console.log(`[Provision] Evolution instance ${evolutionInstanceName} already exists, proceeding`);
    } else {
      throw error;
    }
  }

  // Configure webhook for this instance
  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/webhooks/evolution`;
  try {
    await evo.setWebhook(evolutionInstanceName, webhookUrl, true);
    console.log(`[Provision] Webhook configured for ${evolutionInstanceName}: ${webhookUrl}`);
  } catch (webhookError) {
    console.error('[Provision] Failed to set webhook, but continuing:', webhookError);
    // Don't fail - webhook can be configured later
  }

  // Update DB with Evolution instance name
  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: { evolutionInstanceName },
  });

  console.log(`[Provision] Stored evolutionInstanceName for ${instanceId}: ${evolutionInstanceName}`);

  return evolutionInstanceName;
}

/**
 * Fetches QR code from Evolution API
 */
export async function fetchQrCodeFromEvolution(
  evolutionInstanceName: string
): Promise<{ base64: string }> {
  const evo = getEvolutionClient();
  console.log(`[QR] Requesting QR code for Evolution instance ${evolutionInstanceName}`);
  return await evo.connect(evolutionInstanceName);
}
