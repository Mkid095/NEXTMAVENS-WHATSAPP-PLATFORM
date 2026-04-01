/**
 * Feature Management - Feature Checker
 * Functions for checking if features are enabled for an organization
 */

import { getFeatureFlag, setFeatureFlag, formatFeatureName } from './global.flags';
import type { FeatureFlagKey, FeatureCheckResult } from './types';

/**
 * Check if a feature is enabled for the given organization
 * Supports null orgId (system-level checks) using global flag only
 */
export async function isFeatureEnabled(
  orgId: string | null,
  featureKey: FeatureFlagKey
): Promise<boolean> {
  // If orgId is null (e.g., SUPER_ADMIN without org context), return global value
  if (!orgId) {
    const globalFlag = await getFeatureFlag(featureKey);
    return globalFlag?.enabled ?? false;
  }

  // Check for org override first
  const override = await getOrgFeatureOverride(orgId, featureKey);
  if (override !== null) {
    // If override exists (even if enabled is false), use it
    return override.enabled;
  }

  // No override, inherit global flag
  const globalFlag = await getFeatureFlag(featureKey);
  return globalFlag?.enabled ?? false;
}

/**
 * Detailed feature access check with reasoning
 * Returns whether access is allowed and why
 */
export async function checkFeatureAccess(
  orgId: string | null,
  featureKey: FeatureFlagKey
): Promise<FeatureCheckResult> {
  // Check global flag exists
  const globalFlag = await getFeatureFlag(featureKey);

  if (!globalFlag) {
    return {
      enabled: false,
      reason: 'disabled',
    };
  }

  // If no orgId, just return global state
  if (!orgId) {
    return {
      enabled: globalFlag.enabled,
      reason: globalFlag.enabled ? 'global' : 'disabled',
    };
  }

  // Check org override
  const override = await getOrgFeatureOverride(orgId, featureKey);

  if (override !== null) {
    return {
      enabled: override.enabled,
      reason: override.enabled ? 'org_override' : 'org_override',
    };
  }

  // Inherit from global
  return {
    enabled: globalFlag.enabled,
    reason: 'inherited',
  };
}

/**
 * Initialize default feature flags if they don't exist
 * Called during system startup to ensure all expected flags exist
 */
export async function initializeFeatureFlags(): Promise<void> {
  const defaultFlags: FeatureFlagKey[] = [
    'billing_enabled',
    'payments_enabled',
    'invoices_enabled',
    'usage_billing_enabled',
    'tax_enabled',
    'coupons_enabled',
  ];

  for (const key of defaultFlags) {
    const existing = await getFeatureFlag(key);
    if (!existing) {
      await setFeatureFlag(key, true); // Default to enabled to maintain existing functionality
    }
  }
}

// Need to import getOrgFeatureOverride
import { getOrgFeatureOverride } from './org.overrides';
