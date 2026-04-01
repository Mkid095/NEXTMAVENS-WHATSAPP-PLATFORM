import { FastifyRequest, FastifyReply } from 'fastify';
import type { FastifyError } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';

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
  done: (err?: Error | undefined) => void
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      done(new Error('Missing or invalid Authorization header') as any);
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
    console.log(`[Auth] Looking up user ${payload.userId}`);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        mfaEnabled: true, // Required for 2FA enforcement
      },
    });
    console.log(`[Auth] User lookup result:`, user ? 'found' : 'not found');

    if (!user) {
      done(new Error('User not found') as any);
      return;
    }

    if (!user.isActive) {
      done(new Error('User account is deactivated') as any);
      return;
    }

    // Attach orgId from JWT payload if present (used by orgGuard)
    if (payload.orgId) {
      (user as any).orgId = payload.orgId;
    }

    // Attach user to request object for downstream middleware/handlers
    (request as any).user = user;

    console.log('[Auth] Success, attaching user and calling done');
    done();
  } catch (error: any) {
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      done(new Error('Invalid token') as any);
      return;
    }
    if (error.name === 'TokenExpiredError') {
      done(new Error('Token expired') as any);
      return;
    }

    console.error('Auth middleware error:', error);
    done(error as any);
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
  orgId?: string; // Optional orgId for org-scoped routes
}
