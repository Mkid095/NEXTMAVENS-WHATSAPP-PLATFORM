/**
 * 2FA Enforcement - Utilities
 * Helper functions for the 2FA system
 */

import { isPrivilegedRole } from './types';

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

/**
 * Determine if a user requires 2FA based on their role
 * Convenience wrapper around isPrivilegedRole
 */
export function requires2FA(userRole: string): boolean {
  return isPrivilegedRole(userRole);
}
