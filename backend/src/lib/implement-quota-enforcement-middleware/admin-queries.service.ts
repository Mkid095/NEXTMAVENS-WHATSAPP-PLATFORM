/**
 * Quota Admin Queries Service
 *
 * Administrative operations for monitoring quota usage.
 */

import { PrismaClient } from '@prisma/client';
import type { QuotaMetric, QuotaPeriod } from './types';
import { PLAN_QUOTAS } from './constants';
import { getUsage } from './usage-queries';

/**
 * Get organizations approaching their limit (for admin health check)
 * Returns orgs with remaining < threshold percentage of limit
 */
export async function getNearLimitOrgs(
  prisma: PrismaClient,
  thresholdPercent: number = 0.1
): Promise<Array<{
  orgId: string;
  metric: QuotaMetric;
  current: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}>> {
  try {
    const nearLimit: any[] = [];

    // This is expensive; done in admin API, not per-request
    // Simplified: fetch all orgs and check their current usage
    const orgs = await prisma.organization.findMany({
      select: { id: true, plan: true }
    });

    for (const org of orgs) {
      const planLimits = PLAN_QUOTAS[org.plan as keyof typeof PLAN_QUOTAS];
      if (!planLimits) continue;

      for (const metric of Object.values(QuotaMetric)) {
        const current = await getUsage(prisma, org.id, metric, QuotaPeriod.DAILY);
        const limit = planLimits[metric];
        const percentUsed = current / limit;

        if (percentUsed >= (1 - thresholdPercent)) {
          nearLimit.push({
            orgId: org.id,
            metric,
            current,
            limit,
            remaining: Math.max(0, limit - current),
            percentUsed
          });
        }
      }
    }

    return nearLimit;
  } catch (error: any) {
    console.error('getNearLimitOrgs error:', error);
    return [];
  }
}
