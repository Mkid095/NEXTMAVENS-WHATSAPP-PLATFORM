/**
 * Feature Management Service
 * Provides functionality to manage global feature flags and per-organization overrides.
 *
 * Features follow an inheritance model:
 * 1. Check for org-specific override (enabled/disabled)
 * 2. If no override (null), inherit from global flag
 * 3. Use global flag value
 */

import { prisma } from '../prisma.js';
import type {
  FeatureFlag,
  OrganizationFeatureFlag,
  FeatureCheckResult,
  FeatureFlagKey,
} from './types';

// ============================================================================
// Global Feature Flag Management
// ============================================================================

/**
 * Get a global feature flag by key
 */
export async function getFeatureFlag(key: FeatureFlagKey): Promise<FeatureFlag | null> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
  });

  if (!flag) return null;

  return {
    ...flag,
    createdAt: flag.createdAt.toISOString() as any,
    updatedAt: flag.updatedAt.toISOString() as any,
  } as FeatureFlag;
}

/**
 * Set a global feature flag (enable/disable)
 */
export async function setFeatureFlag(key: FeatureFlagKey, enabled: boolean): Promise<FeatureFlag> {
  const flag = await prisma.featureFlag.upsert({
    where: { key },
    update: {
      enabled,
      updatedAt: new Date(),
    },
    create: {
      key,
      name: formatFeatureName(key),
      enabled,
    },
  });

  return {
    ...flag,
    createdAt: flag.createdAt.toISOString() as any,
    updatedAt: flag.updatedAt.toISOString() as any,
  } as FeatureFlag;
}

/**
 * List all global feature flags
 */
export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  const flags = await prisma.featureFlag.findMany({
    orderBy: { key: 'asc' },
  });

  return flags.map((flag) => ({
    ...flag,
    createdAt: flag.createdAt.toISOString() as any,
    updatedAt: flag.updatedAt.toISOString() as any,
  })) as FeatureFlag[];
}

// ============================================================================
// Organization Feature Override Management
// ============================================================================

/**
 * Get organization feature override for a specific feature key
 * Returns null if no override exists (meaning org inherits from global)
 */
export async function getOrgFeatureOverride(
  orgId: string,
  featureKey: FeatureFlagKey
): Promise<{ orgId: string; featureKey: FeatureFlagKey; enabled: boolean | null } | null> {
  const override = await prisma.organizationFeatureFlag.findUnique({
    where: {
      orgId_featureKey: {
        orgId,
        featureKey,
      },
    },
  });

  if (!override) return null;

  return {
    orgId: override.orgId,
    featureKey: override.featureKey as FeatureFlagKey,
    enabled: override.enabled,
  };
}

/**
 * Set organization feature override
 * @param enabled - true (force on), false (force off), null (remove override, inherit global)
 */
export async function setOrgFeatureOverride(
  orgId: string,
  featureKey: FeatureFlagKey,
  enabled: boolean | null
): Promise<OrganizationFeatureFlag> {
  // If enabled is null, delete the override
  if (enabled === null) {
    try {
      await prisma.organizationFeatureFlag.delete({
        where: {
          orgId_featureKey: {
            orgId,
            featureKey,
          },
        },
      });
    } catch (error: any) {
      // If record doesn't exist, treat as success (no override)
      if (error.code === 'P2025') {
        // do nothing, override already absent
      } else {
        throw error;
      }
    }

    // Return a virtual object indicating no override
    return {
      id: '',
      orgId,
      featureKey,
      enabled: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as OrganizationFeatureFlag;
  }

  // Upsert the override
  const override = await prisma.organizationFeatureFlag.upsert({
    where: {
      orgId_featureKey: {
        orgId,
        featureKey,
      },
    },
    update: {
      enabled,
      updatedAt: new Date(),
    },
    create: {
      orgId,
      featureKey,
      enabled,
    },
  });

  return {
    ...override,
    createdAt: override.createdAt.toISOString() as any,
    updatedAt: override.updatedAt.toISOString() as any,
  } as OrganizationFeatureFlag;
}

/**
 * List all feature overrides for a specific organization
 */
export async function listOrgFeatureOverrides(
  orgId: string
): Promise<Array<{ orgId: string; featureKey: FeatureFlagKey; enabled: boolean | null }>> {
  const overrides = await prisma.organizationFeatureFlag.findMany({
    where: { orgId },
    orderBy: { featureKey: 'asc' },
  });

  return overrides.map((o) => ({
    orgId: o.orgId,
    featureKey: o.featureKey as FeatureFlagKey,
    enabled: o.enabled,
  }));
}

/**
 * Delete organization feature override (same as setting null)
 */
export async function deleteOrgFeatureOverride(
  orgId: string,
  featureKey: FeatureFlagKey
): Promise<boolean> {
  try {
    await prisma.organizationFeatureFlag.delete({
      where: {
        orgId_featureKey: {
          orgId,
          featureKey,
        },
      },
    });
    return true;
  } catch (error: any) {
    if (error.code === 'P2025') {
      // Record not found, treat as success
      return true;
    }
    throw error;
  }
}

// ============================================================================
// Feature Access Check (Combined Logic)
// ============================================================================

/**
 * Check if a feature is enabled for a specific organization
 * Performs lookup: org override -> global flag
 *
 * Special case: SUPER_ADMIN bypasses org checks and always gets effective value
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert feature key to human-readable name
 */
function formatFeatureName(key: FeatureFlagKey): string {
  const names: Record<FeatureFlagKey, string> = {
    billing_enabled: 'Billing System',
    payments_enabled: 'Payments',
    invoices_enabled: 'Invoices',
    usage_billing_enabled: 'Usage-Based Billing',
    tax_enabled: 'Tax Calculation',
    coupons_enabled: 'Coupons & Discounts',
  };
  return names[key] || key;
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
