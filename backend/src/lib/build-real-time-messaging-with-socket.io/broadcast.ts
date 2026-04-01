/**
 * Real-time Messaging - Broadcast Service
 * Methods for sending messages to sockets, rooms, and orgs
 */

import { Socket } from "socket.io";

/**
 * Broadcast to all clients in an instance room
 */
export function broadcastToInstance(
  io: any,
  instanceId: string,
  event: string,
  data: any,
  excludeSocketId?: string
): void {
  if (!io) {
    console.warn("Socket.IO not initialized - dropping broadcast");
    return;
  }
  const room = `instance-${instanceId}`;
  if (excludeSocketId) {
    io.to(room).except(excludeSocketId).emit(event, data);
  } else {
    io.to(room).emit(event, data);
  }
}

/**
 * Broadcast to all clients in an organization room
 */
export function broadcastToOrg(
  io: any,
  orgId: string,
  event: string,
  data: any,
  excludeSocketId?: string
): void {
  if (!io) return;
  const room = `org-${orgId}`;
  if (excludeSocketId) {
    io.to(room).except(excludeSocketId).emit(event, data);
  } else {
    io.to(room).emit(event, data);
  }
}

/**
 * Send direct message to specific socket
 * @returns true if socket was found and message sent
 */
export function sendToSocket(
  io: any,
  socketId: string,
  event: string,
  data: any
): boolean {
  if (!io) return false;
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    socket.emit(event, data);
    return true;
  }
  return false;
}

/**
 * Get current connection count
 * @param room - Optional room name; if omitted returns total connections
 * @returns Number of connected sockets
 */
export function getConnectionCount(io: any, room?: string): number {
  if (!io) return 0;
  if (room) {
    return io.sockets.adapter.rooms.get(room)?.size || 0;
  }
  return io.engine.clientsCount;
}
