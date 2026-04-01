/**
 * 2FA Enforcement - Core Service
 * Core TOTP operations: generation and enable/disable (setup management)
 *
 * Note: Token verification and status queries are in verification.service.ts
 */

import * as speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../prisma';
import type { TwoFactorSetupResponse } from './types';

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
 * Disable 2FA for a user (requires current token for security)
 *
 * @param userId - User ID
 * @param token - Current valid 2FA token for confirmation
 * @returns true if 2FA disabled successfully
 */
export async function disable2FA(userId: string, token: string): Promise<boolean> {
  // Import verification service to validate token
  const { verify2FAToken } = await import('./verification.service');
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
