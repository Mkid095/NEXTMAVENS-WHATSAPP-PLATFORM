/**
 * 2FA Enforcement System for Privileged Roles
 *
 * Provides TOTP-based two-factor authentication for users with
 * privileged roles (SUPER_ADMIN, ORG_ADMIN). Enforces 2FA requirement
 * for all privileged operations.
 *
 * Features:
 * - TOTP secret generation and management
 * - QR code creation for authenticator apps
 * - Token verification with clock drift tolerance
 * - Middleware enforcement for privileged roles
 *
 * @module enforce-2fa-for-privileged-roles
 */

import * as speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../prisma';

// ┌─────────────────────────────────────────────────────────────┐
// │ Types & Constants                                           │
// └─────────────────────────────────────────────────────────────┘

/**
 * Privileged roles that require 2FA
 */
export const PRIVILEGED_ROLES = ['SUPER_ADMIN', 'ORG_ADMIN'] as const;

/**
 * Check if a role requires 2FA
 */
export function isPrivilegedRole(role: string): role is typeof PRIVILEGED_ROLES[number] {
  return PRIVILEGED_ROLES.includes(role as typeof PRIVILEGED_ROLES[number]);
}

/**
 * 2FA setup response data
 */
export interface TwoFactorSetupResponse {
  secret: string;        // Base32 secret (for manual entry)
  qrCode: string;        // Data URL containing QR code
  manualEntry: string;   // Manual entry key (same as secret)
  issuer: string;        // Application name for authenticator
  label: string;         // User identifier (email)
}

/**
 * 2FA verification request
 */
export interface Verify2FARequest {
  token: string;         // 6-digit code from authenticator app
}

/**
 * Disable 2FA request (requires re-authentication)
 */
export interface Disable2FARequest {
  token: string;         // Current 2FA token for confirmation
  password: string;      // User's password for re-authentication
}

/**
 * 2FA status response
 */
export interface TwoFactorStatusResponse {
  enabled: boolean;
  isPrivileged: boolean;
  requires2FA: boolean;  // Whether user is required to have 2FA enabled
}

// ┌─────────────────────────────────────────────────────────────┐
// │ Core 2FA Operations                                         │
// └─────────────────────────────────────────────────────────────┘

/**
 * Generate 2FA setup credentials for a user
 * Creates a new TOTP secret and returns QR code for scanning
 *
 * @param userId - User ID
 * @param userEmail - User email for label
 * @param issuerName - Application name (from ENV or default)
 * @returns Object with secret, QR code, and manual entry info
 */
export async function generate2FASetup(
  userId: string,
  userEmail: string,
  issuerName = 'NEXTMAVENS WhatsApp Platform'
): Promise<TwoFactorSetupResponse> {
  // Generate a new TOTP secret
  const secret = speakeasy.generateSecret({
    name: userEmail,
    issuer: issuerName,
    length: 32,
  });

  // Generate QR code as data URL
  const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

  return {
    secret: secret.base32!,
    qrCode,
    manualEntry: secret.base32!,
    issuer: issuerName,
    label: userEmail,
  };
}

/**
 * Verify and enable 2FA for a user
 * User must provide a valid TOTP token to confirm setup
 *
 * @param userId - User ID
 * @param token - 6-digit TOTP token from authenticator app
 * @returns true if verification successful and 2FA enabled
 */
export async function verifyAndEnable2FA(
  userId: string,
  token: string
): Promise<boolean> {
  // Fetch user's pending secret (stored temporarily during setup)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabled: true },
  });

  if (!user || !user.mfaSecret) {
    throw new Error('No pending 2FA setup. Please start setup first.');
  }

  // If already enabled, reject
  if (user.mfaEnabled) {
    throw new Error('2FA is already enabled for this user.');
  }

  // Verify the token against the secret
  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token,
    window: 2, // Accept ±2 time steps (±60 seconds)
  });

  if (!verified) {
    return false;
  }

  // Mark 2FA as enabled
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true },
  });

  return true;
}

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

  return speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token,
    window: 2,
  });
}

/**
 * Disable 2FA for a user (requires current token for security)
 *
 * @param userId - User ID
 * @param token - Current valid 2FA token for confirmation
 * @returns true if 2FA disabled successfully
 */
export async function disable2FA(userId: string, token: string): Promise<boolean> {
  // First verify the token is correct
  const isValid = await verify2FAToken(userId, token);
  if (!isValid) {
    throw new Error('Invalid 2FA token. Cannot disable 2FA.');
  }

  // Disable 2FA and clear secret
  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
    },
  });

  return true;
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
): Promise<TwoFactorStatusResponse> {
  const enabled = await is2FAEnabled(userId);
  const isPrivileged = isPrivilegedRole(userRole);
  const requires2FA = isPrivileged; // Privileged roles must have 2FA

  return {
    enabled,
    isPrivileged,
    requires2FA,
  };
}

// ┌─────────────────────────────────────────────────────────────┐
// │ Middleware Enforcement                                       │
// └─────────────────────────────────────────────────────────────┘

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

// ┌─────────────────────────────────────────────────────────────┐
// │ Utility Functions                                           │
// └─────────────────────────────────────────────────────────────┘

/**
 * Generate a backup recovery code (optional feature)
 * Could be used for account recovery if user loses authenticator device
 *
 * Note: Not implemented in initial version - would require:
 * - Backup code table with hashed codes
 * - Single-use enforcement
 * - Recovery workflow
 */
export function generateBackupCode(): string {
  // Generate 8-character alphanumeric code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validate TOTP token format (6 digits)
 */
export function isValidTokenFormat(token: string): boolean {
  return /^\d{6}$/.test(token);
}

// ┌─────────────────────────────────────────────────────────────┐
// │ Audit Logging Helpers                                       │
// └─────────────────────────────────────────────────────────────┘

/**
 * Action types for 2FA audit logging
 */
export const TwoFactorAction = {
  ENABLE: 'mfa.enabled',
  DISABLE: 'mfa.disabled',
  VERIFY: 'mfa.verified',
  SETUP_START: 'mfa.setup.started',
  SETUP_COMPLETE: 'mfa.setup.completed',
  ENFORCEMENT_BLOCK: 'mfa.enforcement.blocked',
} as const;

/**
 * Audit log helper - will be implemented when audit logging is active
 * This is a placeholder that can be connected to the AuditLog system
 */
export async function audit2FAAction(
  userId: string,
  action: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  // Future: integrate with AuditLog library from Step 9
  // await createAuditLog({
  //   userId,
  //   action,
  //   resource: 'user',
  //   resourceId: userId,
  //   changes: metadata,
  // });
  console.log(`[2FA Audit] userId=${userId} action=${action} metadata=`, metadata);
}
