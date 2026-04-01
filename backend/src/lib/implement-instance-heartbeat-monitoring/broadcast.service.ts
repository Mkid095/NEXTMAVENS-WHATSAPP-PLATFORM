import { getSocketService } from '../build-real-time-messaging-with-socket.io';

/**
 * Broadcast instance status change via WebSocket
 */
export async function broadcastStatusChange(
  instanceId: string,
  orgId: string,
  status: 'ONLINE' | 'OFFLINE',
  lastSeen?: Date
): Promise<void> {
  try {
    const socketService = getSocketService();
    if (socketService) {
      socketService.broadcastToOrg(orgId, 'whatsapp:instance:status', {
        instanceId,
        status,
        heartbeatStatus: status,
        lastSeen: lastSeen?.toISOString(),
        timestamp: Date.now(),
      });
      console.log(`[Heartbeat] Broadcast status change: instance=${instanceId}, status=${status}`);
    }
  } catch (error) {
    console.error('[Heartbeat] Failed to broadcast status change:', error);
    // Non-critical - continue
  }
}
