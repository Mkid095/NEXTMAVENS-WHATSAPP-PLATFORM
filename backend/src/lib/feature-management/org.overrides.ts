/**
 * Feature Management - Organization Overrides
 * CRUD operations for org-specific feature flag overrides
 */

import { prisma } from '../prisma';
import type { FeatureFlagKey } from './types';

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
 * Set organization feature override (can be explicit true/false or null to remove override)
 */
export async function setOrgFeatureOverride(
  orgId: string,
  featureKey: FeatureFlagKey,
  enabled: boolean | null
): Promise<{ orgId: string; featureKey: FeatureFlagKey; enabled: boolean | null }> {
  if (enabled === null) {
    // Remove override (delete)
    await prisma.organizationFeatureFlag.delete({
      where: {
        orgId_featureKey: {
          orgId,
          featureKey,
        },
      },
    });
    return { orgId, featureKey, enabled: null };
  }

  const override = await prisma.organizationFeatureFlag.upsert({
    where: {
      orgId_featureKey: {
        orgId,
        featureKey,
      },
    },
    update: {
      enabled,
    },
    create: {
      orgId,
      featureKey,
      enabled,
    },
  });

  return {
    orgId: override.orgId,
    featureKey: override.featureKey as FeatureFlagKey,
    enabled: override.enabled,
  };
}

/**
 * List all feature overrides for an organization
 */
export async function listOrgFeatureOverrides(orgId: string): Promise<Array<{ orgId: string; featureKey: FeatureFlagKey; enabled: boolean | null }>> {
  const overrides = await prisma.organizationFeatureFlag.findMany({
    where: { orgId },
    orderBy: { featureKey: 'asc' },
  });

  return overrides.map(o => ({
    orgId: o.orgId,
    featureKey: o.featureKey as FeatureFlagKey,
    enabled: o.enabled,
  }));
}

/**
 * Delete organization feature override (equivalent to setting null)
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
      // Not found
      return false;
    }
    throw error;
  }
}
