/**
 * Real-time Messaging - Socket Service
 * Main service class that orchestrates Socket.IO functionality
 */

import { Server as SocketIOServer } from "socket.io";
import { createClient, RedisClientType } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { prisma } from "../prisma";
import { setupSocketMiddleware } from "./middleware";
import { setupConnectionHandlers } from "./handlers";
import {
  broadcastToInstance,
  broadcastToOrg,
  sendToSocket,
  getConnectionCount
} from "./broadcast";

export class SocketService {
  private io: SocketIOServer | null = null;
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private jwtSecret: string;

  constructor(jwtSecret: string) {
    this.jwtSecret = jwtSecret;
  }

  /**
   * Initialize Socket.IO server with Redis adapter
   * Sets up middleware, connection handlers, and Redis pub/sub
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

    setupSocketMiddleware(this.io, this.jwtSecret);
    setupConnectionHandlers(this.io);

    console.log("✅ Socket.IO initialized with Redis adapter");
  }

  /**
   * Broadcast to all clients in an instance
   */
  broadcastToInstance(instanceId: string, event: string, data: any, excludeSocketId?: string): void {
    broadcastToInstance(this.io, instanceId, event, data, excludeSocketId);
  }

  /**
   * Broadcast to all clients in an organization
   */
  broadcastToOrg(orgId: string, event: string, data: any, excludeSocketId?: string): void {
    broadcastToOrg(this.io, orgId, event, data, excludeSocketId);
  }

  /**
   * Send direct message to specific socket
   * @returns true if socket was found and message sent
   */
  sendToSocket(socketId: string, event: string, data: any): boolean {
    return sendToSocket(this.io, socketId, event, data);
  }

  /**
   * Get connection count for monitoring
   * @param room - Optional room name; if omitted returns total connections
   */
  getConnectionCount(room?: string): number {
    return getConnectionCount(this.io, room);
  }

  /**
   * Graceful shutdown
   * Closes Socket.IO server and Redis connections
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
