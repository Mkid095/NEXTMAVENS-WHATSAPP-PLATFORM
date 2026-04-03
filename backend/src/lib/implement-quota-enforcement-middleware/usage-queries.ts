/**
 * Quota Usage Queries Service
 *
 * Read operations for quota usage.
 */

import { PrismaClient } from '@prisma/client';
import { QuotaMetric, QuotaPeriod } from './types';
import { calculatePeriodStart } from './utils';

/**
 * Get current usage value without incrementing
 */
export async function getUsage(
  prisma: PrismaClient,
  orgId: string,
  metric: QuotaMetric,
  period: QuotaPeriod = QuotaPeriod.DAILY,
  now: Date = new Date()
): Promise<number> {
  try {
    const periodStart = calculatePeriodStart(period, now);
    const usage = await prisma.quotaUsage.findFirst({
      where: {
        orgId,
        metric,
        period,
        periodStart
      },
      select: { value: true }
    });
    return usage ? Number(usage.value) : 0;
  } catch (error: any) {
    console.error('Quota getUsage error:', error);
    return 0;
  }
}
