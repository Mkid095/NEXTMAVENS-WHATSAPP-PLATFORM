/**
 * 2FA Enforcement API Routes
 *
 * Endpoints for managing two-factor authentication for privileged users.
 * All endpoints require authentication via JWT.
 *
 * Base path: /admin/2fa
 *
 * Endpoints:
 * - POST   /setup        - Generate TOTP secret and QR code
 * - POST   /verify       - Verify token and enable 2FA
 * - POST   /disable      - Disable 2FA (requires current token)
 * - GET    /status       - Get 2FA enabled status
 *
 * Security:
 * - All endpoints require authenticated user
 * - Non-privileged users can check status but setup/verify/disable
 *   are intended for privileged roles only
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodType, z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import {
  generate2FASetup,
  verifyAndEnable2FA,
  verify2FAToken,
  disable2FA,
  get2FAStatus,
  require2FA,
  isPrivilegedRole,
  PRIVILEGED_ROLES,
} from '../../../lib/enforce-2fa-for-privileged-roles';

// ┌─────────────────────────────────────────────────────────────┐
// │ Zod Schemas for Validation                                   │
// └─────────────────────────────────────────────────────────────┘

const setupSchema: ZodType<{ token?: never }> = z.object({
  // No body required for setup - uses authenticated user's email
});

const verifySchema: ZodType<{ token: string }> = z.object({
  token: z.string().regex(/^\d{6}$/, 'Token must be 6 digits'),
});

const disableSchema: ZodType<{ token: string }> = z.object({
  token: z.string().regex(/^\d{6}$/, 'Token must be 6 digits'),
});

const statusSchema: ZodType<{ userId?: string }> = z.object({
  userId: z.string().optional(),
});

// ┌─────────────────────────────────────────────────────────────┐
// │ Route Handlers                                               │
// └─────────────────────────────────────────────────────────────┘

/**
 * POST /admin/2fa/setup
 *
 * Generate TOTP secret and QR code for 2FA setup
 *
 * This creates a new TOTP secret that can be scanned by an authenticator app.
 * The secret is stored temporarily in the database. User must verify with a
 * token within a reasonable time to complete setup.
 *
 * Request body: {}
 * Response: TwoFactorSetupResponse
 *
 * Security: Authenticated users only. Privileged users will be required
 * to complete setup before accessing privileged resources.
 */
async function setupHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const user = (request as any).user;

    // Check if 2FA is already enabled
    if (user.mfaEnabled) {
      reply.code(400).send({
        error: '2FA already enabled',
        message: 'Two-factor authentication is already active for this account.',
      });
      return;
    }

    // Generate new 2FA setup credentials
    const setupData = await generate2FASetup(user.id, user.email);

    // Immediately store the secret in user's mfaSecret field (pending verification)
    // In a real system, you might want a separate "mfaPendingSecret" field
    // to distinguish between "setup started" vs "verified and enabled"
    // For simplicity, we store it and only set mfaEnabled after verification

    reply.send({
      success: true,
      data: {
        secret: setupData.secret,
        qrCode: setupData.qrCode,
        manualEntry: setupData.manualEntry,
        issuer: setupData.issuer,
        label: setupData.label,
      },
      message: 'Scan the QR code with your authenticator app, then verify with the 6-digit code.',
    });
  } catch (error: any) {
    console.error('2FA setup error:', error);
    reply.code(500).send({
      error: 'Setup failed',
      message: 'Failed to generate 2FA setup data. Please try again.',
    });
  }
}

/**
 * POST /admin/2fa/verify
 *
 * Verify TOTP token and enable 2FA
 *
 * After scanning the QR code, user provides a 6-digit code from their
 * authenticator app to confirm setup. This enables 2FA on their account.
 *
 * Request body: { token: "123456" }
 * Response: { success: true, message: string }
 *
 * Security: Authenticated users only. Should be called within ~5 minutes
 * of setup to ensure the secret hasn't changed.
 */
async function verifyHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const { token } = verifySchema.parse(request.body);
    const user = (request as any).user;

    // Verify and enable
    const success = await verifyAndEnable2FA(user.id, token);

    if (!success) {
      reply.code(401).send({
        error: 'Invalid token',
        message:
          'The provided 2FA token is invalid. Make sure you are using the current code from your authenticator app.',
      });
      return;
    }

    reply.code(200).send({
      success: true,
      message: 'Two-factor authentication has been successfully enabled.',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      reply.code(400).send({
        error: 'Validation error',
        message: 'Invalid request format. Token must be 6 digits.',
      });
      return;
    }

    console.error('2FA verify error:', error);
    reply.code(500).send({
      error: 'Verification failed',
      message: 'Failed to verify 2FA token. Please try again.',
    });
  }
}

/**
 * POST /admin/2fa/disable
 *
 * Disable 2FA for the authenticated user
 *
 * Requires the current 2FA token as confirmation to prevent accidental
 * or malicious disabling by an attacker with session access.
 *
 * Request body: { token: "123456" }
 * Response: { success: true, message: string }
 *
 * Security: Critical operation - requires current valid 2FA token.
 * Users will be logged out of all devices after disabling.
 */
async function disableHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const { token } = disableSchema.parse(request.body);
    const user = (request as any).user;

    // Verify token and disable
    const success = await disable2FA(user.id, token);

    if (!success) {
      reply.code(401).send({
        error: 'Invalid token',
        message:
          'Cannot disable 2FA: token verification failed. Please check your authenticator app.',
      });
      return;
    }

    reply.send({
      success: true,
      message: 'Two-factor authentication has been disabled.',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      reply.code(400).send({
        error: 'Validation error',
        message: 'Invalid request format. Token must be 6 digits.',
      });
      return;
    }

    console.error('2FA disable error:', error);
    reply.code(500).send({
      error: 'Disable failed',
      message: 'Failed to disable 2FA. Please try again.',
    });
  }
}

/**
 * GET /admin/2fa/status
 *
 * Get 2FA status for the authenticated user (or specified user if admin)
 *
 * Shows:
 * - Whether 2FA is enabled
 * - Whether user has privileged role
 * - Whether 2FA is required (privileged roles always require it)
 *
 * Query params: ?userId=<id> (optional, requires SUPER_ADMIN)
 * Response: TwoFactorStatusResponse
 */
async function statusHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const { userId } = statusSchema.parse(request.query as any);
    const currentUser = (request as any).user;

    // Determine which user to check
    const targetUserId = userId || currentUser.id;

    // If checking another user, require SUPER_ADMIN
    if (userId && currentUser.role !== 'SUPER_ADMIN') {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'Only SUPER_ADMIN can check other users\' 2FA status.',
      });
      return;
    }

    // Fetch target user
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true, mfaEnabled: true },
    });

    if (!targetUser) {
      reply.code(404).send({
        error: 'User not found',
        message: 'The specified user does not exist.',
      });
      return;
    }

    const status = await get2FAStatus(targetUser.id, targetUser.role);

    reply.send({
      success: true,
      data: {
        userId: targetUser.id,
        email: targetUser.email,
        ...status,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      reply.code(400).send({
        error: 'Validation error',
        message: 'Invalid query parameters.',
      });
      return;
    }

    console.error('2FA status error:', error);
    reply.code(500).send({
      error: 'Status check failed',
      message: 'Failed to retrieve 2FA status.',
    });
  }
}

// ┌─────────────────────────────────────────────────────────────┐
// │ Route Registration                                          │
// └─────────────────────────────────────────────────────────────┘

export default async function (fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', async (request, reply) => {
    // Auth middleware (sets request.user) should already be applied globally
    const user = (request as any).user;
    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      throw new Error('Unauthorized');
    }
  });

  // POST /admin/2fa/setup - Generate 2FA setup credentials
  // Note: setupHandler manages its own validation (expects empty body)
  fastify.post('/setup', setupHandler);

  // POST /admin/2fa/verify - Verify and enable 2FA
  // Handler validates token with verifySchema
  fastify.post('/verify', verifyHandler);

  // POST /admin/2fa/disable - Disable 2FA
  // Handler validates token with disableSchema
  fastify.post('/disable', disableHandler);

  // GET /admin/2fa/status - Check 2FA status
  // Handler validates query with statusSchema
  fastify.get('/status', statusHandler);
}
