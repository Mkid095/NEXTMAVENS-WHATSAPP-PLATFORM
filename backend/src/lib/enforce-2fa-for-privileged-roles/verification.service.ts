/**
 * 2FA Enforcement - Verification Service
 * Token verification and status query operations
 */

import { prisma } from '../prisma';
import { isPrivilegedRole } from './types';

/**
 * Verify a 2FA token for login/authentication
 *
 * @param userId - User ID
 * @param token - 6-digit TOTP token
 * @returns true if token is valid
 */
export async function verify2FAToken(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabled: true },
  });

  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    return false;
  }

  // Use the speakeasy library - need to import it here
  const speakeasy = await import('speakeasy');
  return speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token,
    window: 2,
  });
}

/**
 * Check if user has 2FA enabled
 */
export async function is2FAEnabled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true },
  });

  return user?.mfaEnabled ?? false;
}

/**
 * Get user's 2FA status including whether they are required to have it
 */
export async function get2FAStatus(
  userId: string,
  userRole: string
): Promise<import('./types').TwoFactorStatusResponse> {
  const enabled = await is2FAEnabled(userId);
  const isPrivileged = isPrivilegedRole(userRole);
  const requires2FA = isPrivileged; // Privileged roles must have 2FA

  return {
    enabled,
    isPrivileged,
    requires2FA,
  };
}
