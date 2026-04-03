/**
 * Feature Management - Organization Overrides
 * CRUD operations for org-specific feature flag overrides
 */

import { prisma } from '../../shared/database';
import type { OrganizationFeatureFlag, FeatureFlagKey } from './types';

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
