/**
 * 2FA Enforcement - Audit Logging
 * Audit logging helpers for 2FA operations
 */

import { TwoFactorAction } from './types';

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

/**
 * Audit 2FA setup initiation
 */
export async function auditSetupStart(userId: string): Promise<void> {
  await audit2FAAction(userId, TwoFactorAction.SETUP_START);
}

/**
 * Audit 2FA setup completion
 */
export async function auditSetupComplete(userId: string): Promise<void> {
  await audit2FAAction(userId, TwoFactorAction.SETUP_COMPLETE);
}

/**
 * Audit 2FA enablement
 */
export async function auditEnable(userId: string): Promise<void> {
  await audit2FAAction(userId, TwoFactorAction.ENABLE);
}

/**
 * Audit 2FA disablement
 */
export async function auditDisable(userId: string): Promise<void> {
  await audit2FAAction(userId, TwoFactorAction.DISABLE);
}

/**
 * Audit 2FA verification (successful login)
 */
export async function auditVerify(userId: string): Promise<void> {
  await audit2FAAction(userId, TwoFactorAction.VERIFY);
}

/**
 * Audit 2FA enforcement block (privileged user without 2FA)
 */
export async function auditEnforcementBlock(userId: string, attemptedResource: string): Promise<void> {
  await audit2FAAction(userId, TwoFactorAction.ENFORCEMENT_BLOCK, { attemptedResource });
}
