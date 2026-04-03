/**
 * WebSocket / Socket.IO Infrastructure
 *
 * Sets up Socket.IO server with Redis adapter for horizontal scaling.
 * Provides JWT authentication and room-based broadcasting.
 */

import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createClient, RedisClientType } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { prisma } from '../shared/database.js';
import logger from '../shared/logger.js';

let socketService: SocketService | null = null;

export function getSocketService(): SocketService | null {
  return socketService;
}

class SocketService {
  private io: SocketIOServer | null = null;
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;

  async initialize(server: ReturnType<typeof createHttpServer>): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      // Connect to Redis
      this.pubClient = createClient({ url: redisUrl });
      this.subClient = this.pubClient.duplicate();

      this.pubClient.on('error', (err) => logger.error('[RedisPub] Error:', err));
      this.subClient.on('error', (err) => logger.error('[RedisSub] Error:', err));

      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      logger.info('[SocketIO] Redis clients connected');

      // Create Socket.IO server
      this.io = new SocketIOServer(server, {
        adapter: createAdapter(this.pubClient, this.subClient),
        cors: {
          origin: process.env.CORS_ORIGIN || 'https://whatsapp.nextmavens.cloud',
          credentials: true,
        },
        maxHttpBufferSize: 1e6,
        pingTimeout: 60000,
        pingInterval: 25000,
      });

      this.setupMiddleware();
      this.setupConnectionHandlers();

      logger.info('[SocketIO] Server initialized with Redis adapter');
    } catch (error) {
      logger.error('[SocketIO] Initialization failed:', error);
      throw error;
    }
  }

  private setupMiddleware(): void {
    if (!this.io) return;

    this.io.use(async (socket: Socket, next: (err?: any) => void) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token) {
          const err = new Error('Missing auth token');
          (err as any).data = { code: 'MISSING_TOKEN' };
          return next(err);
        }

        const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
        const userId = payload?.userId || payload?.sub;

        if (!userId) {
          const err = new Error('Invalid token payload');
          (err as any).data = { code: 'INVALID_TOKEN' };
          return next(err);
        }

        // Verify user exists and is active (single DB query)
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, isActive: true },
        });

        if (!user || !user.isActive) {
          const err = new Error('User not found or inactive');
          (err as any).data = { code: 'USER_NOT_FOUND' };
          return next(err);
        }

        socket.data.userId = user.id;
        socket.data.role = user.role;
        next();
      } catch (error: any) {
        logger.warn('[SocketMiddleware] Auth failed:', {
          error: error.message,
          name: error.name,
          socketId: socket.id,
        });

        if (error.name === 'TokenExpiredError') {
          const err = new Error('Token expired');
          (err as any).data = { code: 'TOKEN_EXPIRED' };
          return next(err);
        }

        (error as any).data = { code: 'AUTH_FAILED' };
        next(error);
      }
    });
  }

  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      logger.info('[SocketIO] Client connected', {
        socketId: socket.id,
        userId: socket.data.userId,
        role: socket.data.role,
      });

      // Auto-join organization room (orgId will be set when joining an instance)
      // Initially socket.data.orgId may be undefined

      socket.on('join:instance', async (instanceId: string) => {
        try {
          const instance = await prisma.whatsAppInstance.findUnique({
            where: { id: instanceId },
            select: { id: true, orgId: true, status: true },
          });

          if (!instance) {
            socket.emit('error', { message: 'Instance not found' });
            return;
          }

          // Verify access
          const membership = await prisma.member.findFirst({
            where: {
              userId: socket.data.userId,
              orgId: instance.orgId,
            },
          });

          if (!membership) {
            socket.emit('error', { message: 'Access denied' });
            return;
          }

          socket.data.orgId = instance.orgId;
          socket.data.instanceId = instanceId;

          // Join rooms
          socket.join(`org-${instance.orgId}`);
          socket.join(`instance-${instanceId}`);

          logger.info('[SocketIO] Socket joined instance', {
            socketId: socket.id,
            instanceId,
            orgId: instance.orgId,
          });

          // Send current instance status
          socket.emit('instance:status', { instanceId, status: instance.status });
        } catch (error) {
          logger.error('[SocketIO] Error handling join:instance:', error);
          socket.emit('error', { message: 'Failed to join instance' });
        }
      });

      socket.on('leave:instance', (instanceId: string) => {
        socket.leave(`instance-${instanceId}`);
        logger.info('[SocketIO] Socket left instance', { socketId: socket.id, instanceId });
      });

      socket.on('disconnect', (reason: string) => {
        logger.info('[SocketIO] Client disconnected', {
          socketId: socket.id,
          reason,
        });
      });

      socket.on('disconnect_error', (error: any) => {
        logger.warn('[SocketIO] Disconnect error', {
          socketId: socket.id,
          error,
        });
      });

      socket.on('error', (error: any) => {
        logger.error('[SocketIO] Socket error', {
          socketId: socket.id,
          error,
        });
      });
    });

    this.io.on('connect_error', (socket: Socket, error: any) => {
      logger.warn('[SocketIO] Connection error', {
        socketId: socket.id,
        message: error.message,
        data: error.data,
      });
    });

    this.io.on('error', (error: any) => {
      logger.error('[SocketIO] Global error:', error);
    });
  }

  broadcastToInstance(instanceId: string, event: string, data: any, excludeSocketId?: string): void {
    if (!this.io) {
      logger.warn('[SocketIO] Broadcast failed: server not initialized');
      return;
    }
    const room = `instance-${instanceId}`;
    const broadcast = this.io.to(room);
    if (excludeSocketId) {
      broadcast.except(excludeSocketId).emit(event, data);
    } else {
      broadcast.emit(event, data);
    }
  }

  broadcastToOrg(orgId: string, event: string, data: any, excludeSocketId?: string): void {
    if (!this.io) return;
    const room = `org-${orgId}`;
    const broadcast = this.io.to(room);
    if (excludeSocketId) {
      broadcast.except(excludeSocketId).emit(event, data);
    } else {
      broadcast.emit(event, data);
    }
  }

  sendToSocket(socketId: string, event: string, data: any): boolean {
    if (!this.io) return false;
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
      return true;
    }
    return false;
  }

  getConnectionCount(room?: string): number {
    if (!this.io) return 0;
    if (room) {
      return this.io.sockets.adapter.rooms.get(room)?.size || 0;
    }
    return this.io.engine.clientsCount;
  }

  async shutdown(): Promise<void> {
    if (this.io) {
      await this.io.disconnectSockets(true);
      this.io.close();
      logger.info('[SocketIO] Server closed');
    }

    await Promise.all([
      this.pubClient?.quit(),
      this.subClient?.quit(),
    ]);
  }
}

export async function initializeSocket(server: ReturnType<typeof createHttpServer>): Promise<SocketService> {
  if (socketService) {
    logger.warn('[SocketIO] Already initialized, returning existing instance');
    return socketService;
  }

  socketService = new SocketService();
  await socketService.initialize(server);
  return socketService;
}
