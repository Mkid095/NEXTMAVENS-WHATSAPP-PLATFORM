/**
 * Billing Admin Dashboard - Usage Service
 * Provides usage summary and quota information
 */

import { prisma } from '../prisma';
import { getCurrentUsage } from '../implement-usage-based-billing-&-overage';
import type { UsageSummary } from './types';

// Plan quotas - must stay in sync with usage-service.ts
const PLAN_QUOTAS: Record<string, Record<string, { includedUnits: number; overageRateCents: number }>> = {
  FREE: {
    api_requests: { includedUnits: 1000, overageRateCents: 10 },
  },
  STARTER: {
    api_requests: { includedUnits: 10000, overageRateCents: 5 },
  },
  PRO: {
    api_requests: { includedUnits: 100000, overageRateCents: 2 },
  },
  ENTERPRISE: {
    api_requests: { includedUnits: 1000000, overageRateCents: 1 },
  },
};

/**
 * Get usage summary for an organization
 */
export async function getUsageSummary(
  orgId: string,
  meterName?: string
): Promise<UsageSummary[]> {
  // If meterName not specified, default to "api_requests"
  const meters = meterName ? [meterName] : ['api_requests'];

  const results: UsageSummary[] = [];

  for (const meter of meters) {
    try {
      const usage = await getCurrentUsage(orgId, meter);

      // Get org details for name
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, plan: true },
      });

      if (!org) continue;

      const quota = PLAN_QUOTAS[org.plan]?.[meter];
      if (!quota) continue;

      const overageUnits = Math.max(0, usage.usage - quota.includedUnits);
      const overageChargesCents = overageUnits * (quota.overageRateCents || 0);

      results.push({
        orgId,
        orgName: org.name,
        meterName: meter,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
        totalUsage: usage.usage,
        includedUnits: quota.includedUnits,
        overageUnits,
        overageChargesCents,
        quotaPercentage: (usage.usage / quota.includedUnits) * 100,
      });
    } catch (error) {
      // Skip meters that fail; maybe org has no data
      continue;
    }
  }

  return results;
}
