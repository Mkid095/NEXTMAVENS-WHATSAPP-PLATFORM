/**
 * 2FA Enforcement - Middleware
 * Middleware factory for enforcing 2FA on privileged routes
 */

import { isPrivilegedRole } from './types';

/**
 * Middleware factory: Enforce 2FA for privileged roles
 *
 * Usage:
 *   register('/admin', require2FA(), handler)
 *
 * This middleware:
 * - Checks if user has privileged role (SUPER_ADMIN, ORG_ADMIN)
 * - If privileged, verifies mfaEnabled is true
 * - If 2FA required but not enabled, returns 403
 *
 * Note: This middleware depends on auth middleware having run first
 * (expects request.user to be set)
 */
export function require2FA() {
  return {
    async onRequest(
      request: any,
      reply: any,
      done: (err?: any) => void
    ): Promise<void> {
      try {
        const user = request.user;

        if (!user) {
          done(new Error('Unauthorized') as any);
          return;
        }

        // Check if user has privileged role
        if (!isPrivilegedRole(user.role)) {
          // Non-privileged users don't require 2FA
          done();
          return;
        }

        // Privileged user must have 2FA enabled
        if (!user.mfaEnabled) {
          reply.code(403).send({
            error: 'Two-factor authentication required',
            message:
              'Users with privileged roles must enable 2FA to access this resource.',
            code: 'MFA_REQUIRED',
          });
          done();
          return;
        }

        // All checks passed
        done();
      } catch (error: any) {
        console.error('require2FA middleware error:', error);
        done(error as any);
      }
    },
  };
}

/**
 * Alternative middleware: Skip 2FA for non-privileged roles
 * (Just a semantic wrapper for clarity)
 */
export function skip2FAForNonPrivileged() {
  return {
    async onRequest(
      request: any,
      reply: any,
      done: (err?: any) => void
    ): Promise<void> {
      // This middleware is a no-op - included for semantic clarity
      done();
    },
  };
}
