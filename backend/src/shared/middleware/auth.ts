import { FastifyRequest, FastifyReply } from 'fastify';
import { FastifyError } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';

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
  reply: FastifyReply
): Promise<void> {
  // Public routes that don't require authentication
  const publicRoutes = [
    '/health',
    '/metrics',
    '/webhooks/evolution',
  ];

  // Check if current route is public
  const path = request.url || '';
  const isPublic = publicRoutes.some(route =>
    path === route || path.startsWith(route + '/')
  );

  if (isPublic) {
    return; // Skip authentication for public routes
  }

  // Extract token from Authorization header
  const authHeader = request.headers.authorization as string | undefined;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
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
    throw new Error('User not found');
  }

  if (!user.isActive) {
    throw new Error('User account is deactivated');
  }

  // Attach orgId from JWT payload if present (used by orgGuard)
  if (payload.orgId) {
    (user as any).orgId = payload.orgId;
  }

  // Attach user to request object for downstream middleware/handlers
  (request as any).user = user;

  console.log('[Auth] Success, user attached');
}

/**
 * Optional: Public route handler (no auth required)
 */
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization as string | undefined;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided - continue without user
    (request as any).user = null;
    return;
  }

  const token = authHeader.slice(7);
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  try {
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
  } catch (error) {
    // Silently ignore auth errors for optional routes
    (request as any).user = null;
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
