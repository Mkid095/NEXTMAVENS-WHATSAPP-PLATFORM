/**
 * Usage Billing - Query Service
 * Read operations for usage analytics and statistics
 */

import { prisma } from '../prisma';
import type { UsageAnalytics } from './types';

/**
 * Get current usage for a meter within the active billing period (calendar month)
 */
export async function getCurrentUsage(
  orgId: string,
  meterName: string
): Promise<{ usage: number; periodStart: Date; periodEnd: Date }> {
  const period = getCurrentCalendarPeriod();
  const usage = await getCurrentUsageFromDB(orgId, meterName, period.periodStart);

  return {
    usage,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  };
}

/**
 * Get usage analytics over a date range
 */
export async function getUsageAnalytics(
  orgId: string,
  meterName: string,
  dateFrom: Date,
  dateTo: Date
): Promise<UsageAnalytics> {
  const dailyUsage: Array<{ date: string; total: bigint }> = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('day', recorded_at) as date,
      SUM(value) as total
    FROM usage_events
    WHERE
      org_id = ${orgId}
      AND meter_name = ${meterName}
      AND recorded_at >= ${dateFrom}
      AND recorded_at <= ${dateTo}
    GROUP BY DATE_TRUNC('day', recorded_at)
    ORDER BY date ASC
  `;

  const totalUsage = dailyUsage.reduce((sum, row) => sum + Number(row.total), 0);

  return {
    orgId,
    meterName,
    periodStart: dateFrom,
    periodEnd: dateTo,
    totalUsage,
    dailyBreakdown: dailyUsage.map((row) => ({
      date: new Date(row.date as string),
      value: Number(row.total),
    })),
  };
}

/**
 * Get aggregated usage for current period from DB
 */
async function getCurrentUsageFromDB(
  orgId: string,
  meterName: string,
  periodStart: Date
): Promise<number> {
  const result = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COALESCE(SUM(value), 0) as total
    FROM usage_events
    WHERE
      org_id = ${orgId}
      AND meter_name = ${meterName}
      AND recorded_at >= ${periodStart}
  `;

  return Number(result[0]?.total || 0);
}

/**
 * Calculate the current calendar month period
 */
function getCurrentCalendarPeriod(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const periodStart = new Date(Date.UTC(year, month, 1));
  const periodEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  return { periodStart, periodEnd };
}

/**
 * Health check
 */
export function healthCheck(): boolean {
  return true;
}
