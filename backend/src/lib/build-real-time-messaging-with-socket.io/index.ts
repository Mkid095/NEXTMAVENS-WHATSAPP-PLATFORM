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
 */

import { Server as SocketIOServer, Socket } from "socket.io";
import { createClient, RedisClientType } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import * as jwt from "jsonwebtoken";

// Use the shared Prisma singleton
import { prisma } from "../prisma";

// ==========================================
// TYPES
// ==========================================

export interface SocketAuthData {
  userId: string;
  orgId: string;
}

export interface BroadcastOptions {
  orgId?: string;
  instanceId?: string;
  excludeSocketId?: string; // Don't send to sender
}

// ==========================================
// SOCKET SERVICE CLASS
// ==========================================

class SocketService {
  private io: SocketIOServer | null = null;
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private jwtSecret: string;

  constructor(jwtSecret: string) {
    this.jwtSecret = jwtSecret;
  }

  /**
   * Initialize Socket.IO server with Redis adapter
   */
  async initialize(server: any): Promise<void> {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    // Create Redis clients
    this.pubClient = createClient({ url: redisUrl });
    this.subClient = this.pubClient.duplicate();

    await Promise.all([
      this.pubClient.connect(),
      this.subClient.connect()
    ]);

    // Create Socket.IO server
    this.io = new SocketIOServer(server, {
      adapter: createAdapter(this.pubClient, this.subClient),
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        credentials: true
      },
      maxHttpBufferSize: 1e6, // 1MB max payload
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupMiddleware();
    this.setupConnectionHandlers();

    console.log("✅ Socket.IO initialized with Redis adapter");
  }

  /**
   * JWT Authentication Middleware
   */
  private setupMiddleware(): void {
    if (!this.io) throw new Error("Socket.IO not initialized");

    this.io.use(async (socket: Socket, next: (err?: any) => void) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token) {
          const err = new Error("unauthorized");
          (err as any).data = { code: "MISSING_TOKEN" };
          return next(err);
        }

        // Verify JWT
        const payload = jwt.verify(token, this.jwtSecret) as any;
        if (!payload?.sub) {
          const err = new Error("invalid token");
          (err as any).data = { code: "INVALID_TOKEN" };
          return next(err);
        }

        // Verify user exists and is active
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, role: true, isActive: true }
        });

        if (!user || !user.isActive) {
          const err = new Error("user not found or inactive");
          (err as any).data = { code: "USER_NOT_FOUND" };
          return next(err);
        }

        // Attach user data to socket
        socket.data.userId = user.id;
        socket.data.role = user.role;

        next();
      } catch (err: any) {
        if (err.name === "TokenExpiredError") {
          const err2 = new Error("token expired");
          (err2 as any).data = { code: "TOKEN_EXPIRED" };
          return next(err2);
        }
        next(err);
      }
    });
  }

  /**
   * Connection/Disconnection Handlers
   */
  private setupConnectionHandlers(): void {
    if (!this.io) throw new Error("Socket.IO not initialized");

    this.io.on("connection", (socket: Socket) => {
      const orgId = socket.data.orgId;
      const instanceId = socket.data.instanceId;

      console.log(`🔌 Client connected: ${socket.id} (org: ${orgId})`);

      // Auto-join org room
      socket.join(`org-${orgId}`);

      // Handle manual instance join (for chat sessions)
      socket.on("join:instance", (instanceId: string) => {
        this.handleJoinInstance(socket, instanceId);
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
   */
  private async handleJoinInstance(socket: Socket, instanceId: string): Promise<void> {
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



  // ==========================================
  // PUBLIC BROADCAST METHODS
  // ==========================================

  /**
   * Broadcast to all clients in an instance
   */
  broadcastToInstance(instanceId: string, event: string, data: any, excludeSocketId?: string): void {
    if (!this.io) {
      console.warn("Socket.IO not initialized - dropping broadcast");
      return;
    }
    const room = `instance-${instanceId}`;
    if (excludeSocketId) {
      this.io.to(room).except(excludeSocketId).emit(event, data);
    } else {
      this.io.to(room).emit(event, data);
    }
  }

  /**
   * Broadcast to all clients in an organization
   */
  broadcastToOrg(orgId: string, event: string, data: any, excludeSocketId?: string): void {
    if (!this.io) return;
    const room = `org-${orgId}`;
    if (excludeSocketId) {
      this.io.to(room).except(excludeSocketId).emit(event, data);
    } else {
      this.io.to(room).emit(event, data);
    }
  }

  /**
   * Broadcast to specific socket (direct message)
   */
  sendToSocket(socketId: string, event: string, data: any): boolean {
    if (!this.io) return false;
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
      return true;
    }
    return false;
  }

  /**
   * Get connection count for org/instance (monitoring)
   */
  getConnectionCount(room?: string): number {
    if (!this.io) return 0;
    if (room) {
      return this.io.sockets.adapter.rooms.get(room)?.size || 0;
    }
    return this.io.engine.clientsCount;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.io) {
      await this.io.disconnectSockets(true);
      this.io.close();
      console.log("🔌 Socket.IO server closed");
    }
    await Promise.all([
      this.pubClient?.quit(),
      this.subClient?.quit()
    ]);
    await prisma.$disconnect();
  }
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

let socketService: SocketService | null = null;

export function getSocketService(): SocketService | null {
  return socketService;
}

export async function initializeSocket(server: any): Promise<SocketService> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  socketService = new SocketService(jwtSecret);
  await socketService.initialize(server);
  return socketService;
}
