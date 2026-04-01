/**
 * 2FA Enforcement - Type Definitions
 * Types, interfaces, and constants for the 2FA system
 */

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
