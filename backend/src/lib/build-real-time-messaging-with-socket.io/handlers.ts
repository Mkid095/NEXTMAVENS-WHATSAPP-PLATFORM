/**
 * Real-time Messaging - Connection Handlers
 * Handles socket connection, disconnection, and event registration
 */

import { Socket } from "socket.io";
import { prisma } from "../prisma";

/**
 * Setup connection and disconnection handlers
 * Registers all socket event listeners
 *
 * @param io - Socket.IO server instance
 */
export function setupConnectionHandlers(io: any): void {
  // Global error listeners for debugging
  io.on("connect_error", (socket: Socket, err: any) => {
    console.error(`[SocketConnectError] Socket ${socket.id} failed to connect:`, err.message, err.data);
  });

  io.on("error", (err: any) => {
    console.error("[SocketIOError] Global Socket.IO error:", err);
  });

  io.on("connection", (socket: Socket) => {
    const orgId = socket.data.orgId;
    const instanceId = socket.data.instanceId;

    console.log(`🔌 Client connected: ${socket.id} (userId: ${socket.data.userId}, role: ${socket.data.role})`);

    // Auto-join org room
    socket.join(`org-${orgId}`);

    // Handle manual instance join (for chat sessions)
    socket.on("join:instance", (instanceId: string) => {
      handleJoinInstance(socket, instanceId);
    });

    // Handle leaving instance
    socket.on("leave:instance", (instanceId: string) => {
      socket.leave(`instance-${instanceId}`);
      console.log(`👋 Socket ${socket.id} left instance ${instanceId}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    });

    socket.on("disconnect_error", (err) => {
      console.error(`⚠️ Disconnect error on ${socket.id}:`, err);
    });
  });
}

/**
 * Join an instance room after verifying access
 * Validates instance exists and user has membership in org
 */
async function handleJoinInstance(socket: Socket, instanceId: string): Promise<void> {
  try {
    // Fetch the instance
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, orgId: true, status: true }
    });

    if (!instance) {
      socket.emit("error", { message: "Instance not found" });
      return;
    }

    // Check that the user is a member of the instance's org
    const membership = await prisma.member.findFirst({
      where: {
        userId: socket.data.userId,
        orgId: instance.orgId
      }
    });

    if (!membership) {
      socket.emit("error", { message: "Access denied to instance" });
      return;
    }

    socket.data.instanceId = instanceId;
    socket.data.orgId = instance.orgId; // Cache orgId for later use
    socket.join(`instance-${instanceId}`);
    console.log(`📲 Socket ${socket.id} joined instance ${instanceId}`);

    // Send current instance status directly from WhatsAppInstance
    socket.emit("instance:status", { instanceId, status: instance.status });
  } catch (error) {
    console.error("Error handling join:instance:", error);
    socket.emit("error", { message: "Failed to join instance" });
  }
}
