/**
 * Real-time Messaging - Type Definitions
 * Socket.IO types and interfaces
 */

export interface SocketAuthData {
  userId: string;
  orgId: string;
}

export interface BroadcastOptions {
  orgId?: string;
  instanceId?: string;
  excludeSocketId?: string; // Don't send to sender
}

export interface SocketServiceInterface {
  broadcastToInstance(instanceId: string, event: string, data: any, excludeSocketId?: string): void;
  broadcastToOrg(orgId: string, event: string, data: any, excludeSocketId?: string): void;
  sendToSocket(socketId: string, event: string, data: any): boolean;
  getConnectionCount(room?: string): number;
  shutdown(): Promise<void>;
}
