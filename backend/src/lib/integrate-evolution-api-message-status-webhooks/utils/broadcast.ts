/**
 * Broadcast Utilities
 * Helpers for sending Socket.IO events
 */

import { getSocketService } from '../build-real-time-messaging-with-socket.io';

/**
 * Broadcast event to instance room (if socket service is available)
 */
export async function broadcastToInstance(instanceId: string, event: string, data: any): Promise<void> {
  const socketService = getSocketService();
  if (socketService) {
    await socketService.broadcastToInstance(instanceId, event, data);
  }
}

/**
 * Broadcast event to org room (if socket service is available)
 */
export async function broadcastToOrg(orgId: string, event: string, data: any): Promise<void> {
  const socketService = getSocketService();
  if (socketService) {
    await socketService.broadcastToOrg(orgId, event, data);
  }
}
