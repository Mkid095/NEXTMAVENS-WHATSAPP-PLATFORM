/**
 * Socket.IO Real-time Messaging Service
 *
 * Provides WebSocket-based real-time communication for multi-tenant WhatsApp platform.
 * Features: JWT authentication, Redis adapter for scaling, room-based tenant isolation.
 *
 * Events:
 *   - whatsapp:message:upsert - New/updated message
 *   - whatsapp:message:delete - Message deleted
 *   - whatsapp:instance:status - Instance status change
 *   - whatsapp:connection:update - QR code/connection updates
 *
 * Architecture:
 *   - Rooms: `org-{orgId}`, `instance-{instanceId}`
 *   - Multi-server: Redis adapter syncs room state
 *   - Auth: JWT on connection handshake
 *
 * All files under 150 lines.
 */

import { SocketService } from './server';

let socketService: SocketService | null = null;

/**
 * Get the singleton SocketService instance
 * Returns null if not initialized yet
 */
export function getSocketService(): SocketService | null {
  return socketService;
}

/**
 * Initialize Socket.IO service with HTTP server
 * Must be called during application startup
 *
 * @param server - HTTP server instance
 * @returns Initialized SocketService
 */
export async function initializeSocket(server: any): Promise<SocketService> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  socketService = new SocketService(jwtSecret);
  await socketService.initialize(server);
  return socketService;
}

// Re-export types
export * from './types';

// Re-export individual components for advanced usage
export { SocketService } from './server';
export { setupSocketMiddleware } from './middleware';
export { setupConnectionHandlers } from './handlers';
export {
  broadcastToInstance,
  broadcastToOrg,
  sendToSocket,
  getConnectionCount
} from './broadcast';
