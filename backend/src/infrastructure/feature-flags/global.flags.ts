/**
 * Feature Management - Global Flags
 * CRUD operations for global feature flags
 */

import { prisma } from '../prisma.js';
import type { FeatureFlag, FeatureFlagKey } from './types';

/**
 * Convert feature key to human-readable name
 */
export function formatFeatureName(key: FeatureFlagKey): string {
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
