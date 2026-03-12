import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FastifyError } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * orgGuard Middleware
 *
 * CRITICAL: This middleware enforces tenant isolation by:
 * 1. Verifying user is a member of the requested org (unless SUPER_ADMIN)
 * 2. Setting PostgreSQL session variable `app.current_org` for RLS
 *
 * Must run AFTER auth middleware (which sets req.user)
 * Must run BEFORE any database query
 */
export async function orgGuard(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: FastifyError | undefined) => void
): Promise<void> {
  try {
    const user = (request as any).user; // Set by auth middleware

    if (!user) {
      done(new Error('Unauthorized: No user context') as any);
      return;
    }

    // SUPER_ADMIN bypasses org checks - can see all orgs
    if (user.role === 'SUPER_ADMIN') {
      // Set RLS context: role = SUPER_ADMIN enables bypass, org can be NULL
      await prisma.$executeRaw`
        SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)
      `;
      await prisma.$executeRaw`
        SELECT set_config('app.current_org', NULL, false)
      `;
      done();
      return;
    }

    // Determine orgId from request
    // Priority: route params > user's primary org
    const orgIdFromParams = (request.params as any)?.orgId;
    const orgId = orgIdFromParams || user.orgId;

    if (!orgId) {
      done(new Error('Bad Request: No orgId specified') as any);
      return;
    }

    // Verify user is a member of this org
    const member = await prisma.member.findFirst({
      where: {
        userId: user.id,
        orgId: orgId,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!member) {
      done(new Error('Access denied: Not a member of this organization') as any);
      return;
    }

    // Set RLS context for this database session
    // All subsequent queries automatically filter by this orgId
    await prisma.$executeRaw`
      SELECT set_config('app.current_org', ${orgId}, false)
    `;
    await prisma.$executeRaw`
      SELECT set_config('app.current_user_role', ${member.role}, false)
    `;

    // Store org context on request for convenience
    (request as any).currentOrgId = orgId;
    (request as any).memberRole = member.role;

    done();
  } catch (error: any) {
    console.error('orgGuard error:', error);
    done(error as any);
  }
}

/**
 * Alternative: orgGuard for routes without orgId in params
 * Uses user's primary org (from JWT)
 */
export async function orgGuardSimple(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: FastifyError | undefined) => void
): Promise<void> {
  try {
    const user = request.user as any;

    if (!user) {
      done(new Error('Unauthorized') as any);
      return;
    }

    if (user.role === 'SUPER_ADMIN') {
      await prisma.$executeRaw`
        SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)
      `;
      await prisma.$executeRaw`
        SELECT set_config('app.current_org', NULL, false)
      `;
      done();
      return;
    }

    if (!user.orgId) {
      done(new Error('User has no primary org') as any);
      return;
    }

    // Verify membership (even for primary org)
    const member = await prisma.member.findFirst({
      where: {
        userId: user.id,
        orgId: user.orgId,
      },
      select: { id: true, role: true },
    });

    if (!member) {
      done(new Error('Access denied: Not a member of org') as any);
      return;
    }

    await prisma.$executeRaw`
      SELECT set_config('app.current_org', ${user.orgId}, false)
    `;
    await prisma.$executeRaw`
      SELECT set_config('app.current_user_role', ${member.role}, false)
    `;

    (request as any).currentOrgId = user.orgId;
    done();
  } catch (error: any) {
    console.error('orgGuardSimple error:', error);
    done(error as any);
  }
}

/**
 * Utility: Get current orgId from request (after orgGuard has run)
 */
export function getCurrentOrgId(request: FastifyRequest): string | null {
  return (request as any).currentOrgId || null;
}

/**
 * Utility: Check if user is SUPER_ADMIN
 */
export function isSuperAdmin(request: FastifyRequest): boolean {
  return (request.user as any)?.role === 'SUPER_ADMIN';
}
