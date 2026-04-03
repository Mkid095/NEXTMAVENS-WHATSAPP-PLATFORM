/**
 * Handle QRCODE_UPDATED - QR code refreshed (for reconnection)
 */

import { prisma } from '../../prisma';
import { broadcastToInstance } from '../utils/broadcast';

export async function handleQRCodeUpdate(
  event: { instanceId: string; qrCode: string; status?: string },
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { instanceId, qrCode, status } = event;

  if (!qrCode) {
    return { success: false, error: 'QR code data missing in webhook payload' };
  }

  try {
    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: { qrCode },
    });

    await broadcastToInstance(instanceId, 'whatsapp:instance:qr:update', {
      instanceId,
      qrCode,
      status: status || 'pending',
      timestamp: Date.now(),
    });

    return { success: true, result: `QR code updated for instance ${instanceId}` };
  } catch (error: any) {
    console.error(`Error updating QR code for instance ${instanceId}:`, error);
    return { success: false, error: error.message };
  }
}
