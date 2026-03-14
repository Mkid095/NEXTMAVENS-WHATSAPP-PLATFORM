/**
 * 2FA Enforcement Middleware
 *
 * Can be applied to any route to require 2FA for privileged users.
 * Non-privileged users are not affected.
 *
 * Usage:
 *   fastify.use('/admin', enforce2FA());
 *   OR
 *   fastify.get('/admin/sensitive', { preHandler: [auth, enforce2FA()] }, handler);
 *
 * Note: Must run AFTER auth middleware (which sets request.user)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { isPrivilegedRole } from '../lib/enforce-2fa-for-privileged-roles';
import { prisma } from '../lib/prisma';

/**
 * Create a preHandler middleware that enforces 2FA
 */
export async function enforce2FA(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: any) => void
): Promise<void> {
  try {
    const user = (request as any).user;

    if (!user) {
      done(new Error('Unauthorized') as any);
      return;
    }

    // Only enforce for privileged roles
    if (!isPrivilegedRole(user.role)) {
      done();
      return;
    }

    // Check if 2FA is enabled
    // We check the database because request.user might be from JWT and could be stale
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { mfaEnabled: true },
    });

    if (!dbUser?.mfaEnabled) {
      // Log this security event
      console.warn(
        `[2FA Enforcement] Privileged user ${user.id} (${user.role}) attempted access without 2FA enabled`
      );

      reply.code(403).send({
        error: 'Two-factor authentication required',
        message:
          'Users with privileged roles (SUPER_ADMIN, ORG_ADMIN) must enable 2FA to access this resource.',
        code: 'MFA_REQUIRED',
        action: 'Please enable 2FA in your profile settings.',
      });
      done();
      return;
    }

    done();
  } catch (error: any) {
    console.error('enforce2FA middleware error:', error);
    done(error as any);
  }
}

/**
 * Fastify plugin to register 2FA enforcement globally on a prefix
 *
 * Usage in server.ts:
 *   enforce2FAPlugin.register(app, { prefix: '/admin' });
 */
export async function enforce2FAPlugin(
  fastify: FastifyInstance,
  options: { prefix?: string; exclude?: string[] } = {}
): Promise<void> {
  const { prefix = '/admin', exclude = ['/admin/2fa'] } = options;

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip if route doesn't match prefix
    const path = request.raw.url || '';
    if (!path.startsWith(prefix)) {
      return;
    }

    // Skip excluded paths (like /admin/2fa/setup)
    if (exclude.some((ex) => path.startsWith(ex))) {
      return;
    }

    // Run enforcement
    const user = (request as any).user;
    if (!user) {
      // Auth middleware should handle this
      return;
    }

    if (!isPrivilegedRole(user.role)) {
      return;
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { mfaEnabled: true },
    });

    if (!dbUser?.mfaEnabled) {
      console.warn(
        `[2FA Enforcement] Privileged user ${user.id} (${user.role}) blocked from ${request.method} ${path}`
      );
      reply.code(403).send({
        error: 'Two-factor authentication required',
        message:
          'Users with privileged roles must enable 2FA to access admin resources.',
        code: 'MFA_REQUIRED',
      });
      // Throwing here stops the request
      throw new Error('MFA_REQUIRED');
    }
  });
}
