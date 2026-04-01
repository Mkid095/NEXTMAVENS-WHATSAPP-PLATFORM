/**
 * Real-time Messaging - Socket Middleware
 * JWT authentication middleware for Socket.IO connections
 */

import { Socket } from "socket.io";
import * as jwt from "jsonwebtoken";
import { prisma } from "../prisma";

/**
 * Setup JWT authentication middleware for Socket.IO
 * Validates token on handshake and attaches user data to socket
 *
 * @param io - Socket.IO server instance
 * @param jwtSecret - JWT secret for verification
 */
export function setupSocketMiddleware(io: any, jwtSecret: string): void {
  io.use(async (socket: Socket, next: (err?: any) => void) => {
    console.log(`[SocketMiddleware] Start for socket ${socket.id}`);
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        console.log(`[SocketMiddleware] No token provided for socket ${socket.id}`);
        const err = new Error("unauthorized");
        (err as any).data = { code: "MISSING_TOKEN" };
        return next(err);
      }

      console.log(`[SocketMiddleware] Verifying token for socket ${socket.id}`);
      const payload = jwt.verify(token, jwtSecret) as any;
      const userId = payload?.sub || payload?.userId;
      if (!userId) {
        console.log(`[SocketMiddleware] No userId in token payload for socket ${socket.id}`);
        const err = new Error("invalid token");
        (err as any).data = { code: "INVALID_TOKEN" };
        return next(err);
      }

      console.log(`[SocketMiddleware] Token valid, userId=${userId}. Checking user...`);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true }
      });

      if (!user || !user.isActive) {
        console.log(`[SocketMiddleware] User not found or inactive: ${userId}`);
        const err = new Error("user not found or inactive");
        (err as any).data = { code: "USER_NOT_FOUND" };
        return next(err);
      }

      socket.data.userId = user.id;
      socket.data.role = user.role;
      console.log(`[SocketMiddleware] Accepting socket ${socket.id}, userId=${user.id}, role=${user.role}`);
      next();
    } catch (err: any) {
      console.error(`[SocketMiddleware] Error for socket ${socket.id}:`, err.message, err.code, err.name);
      if (err.name === "TokenExpiredError") {
        const err2 = new Error("token expired");
        (err2 as any).data = { code: "TOKEN_EXPIRED" };
        return next(err2);
      }
      next(err);
    }
  });
}
