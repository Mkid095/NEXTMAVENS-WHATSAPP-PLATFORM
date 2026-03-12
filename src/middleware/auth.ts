import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

/**
 * Authentication Middleware
 *
 * Verifies JWT token from Authorization header and attaches user to request.
 * Must run BEFORE orgGuard middleware which depends on request.user.
 *
 * Expected JWT payload: { userId: string, iat?: number, exp?: number, ... }
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: FastifyError | undefined) => void
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      done(new FastifyError(401, 'Missing or invalid Authorization header'));
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // Verify JWT signature and expiration
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable not set');
    }

    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // Fetch user from database with essential data
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      done(new FastifyError(401, 'User not found'));
      return;
    }

    if (!user.isActive) {
      done(new FastifyError(401, 'User account is deactivated'));
      return;
    }

    // Attach user to request object for downstream middleware/handlers
    (request as any).user = user;

    done();
  } catch (error: any) {
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      done(new FastifyError(401, 'Invalid token'));
      return;
    }
    if (error.name === 'TokenExpiredError') {
      done(new FastifyError(401, 'Token expired'));
      return;
    }

    console.error('Auth middleware error:', error);
    done(error as FastifyError);
  }
}

/**
 * Optional: Public route handler (no auth required)
 */
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: FastifyError | undefined) => void
): Promise<void> {
  try {
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - continue without user
      (request as any).user = null;
      done();
      return;
    }

    const token = authHeader.slice(7);
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET not configured');
    }

    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (user && user.isActive) {
      (request as any).user = user;
    } else {
      (request as any).user = null;
    }

    done();
  } catch (error: any) {
    // Silently ignore auth errors for optional routes
    (request as any).user = null;
    done();
  }
}

/**
 * Type guard for user with org context
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  isActive: boolean;
  // Optional: primary org if set
  orgId?: string;
}

interface JwtPayload {
  userId: string;
  // Additional custom fields can be added
}
