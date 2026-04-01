/**
 * Quota Utilities
 *
 * Date/time calculations for quota periods and plan limit lookups.
 */

import { QuotaPeriod, QuotaMetric } from './types';
import { PLAN_QUOTAS } from './constants';

/**
 * Calculate period start timestamp (UTC) for given metric
 * - hourly: floor to hour (e.g., 14:30 → 14:00)
 * - daily: midnight UTC (00:00:00)
 * - monthly: 1st day of month, 00:00:00 UTC
 */
export function calculatePeriodStart(period: QuotaPeriod, now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  const ms = now.getUTCMilliseconds();

  let periodStart: Date;

  switch (period) {
    case QuotaPeriod.HOURLY:
      periodStart = new Date(Date.UTC(year, month, date, hours, 0, 0, 0));
      break;
    case QuotaPeriod.DAILY:
      periodStart = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
      break;
    case QuotaPeriod.MONTHLY:
      periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      break;
    default:
      throw new Error(`Unknown quota period: ${period}`);
  }

  return periodStart.toISOString();
}

/**
 * Get plan-specific limit for a metric
 */
export function getPlanLimit(plan: string, metric: QuotaMetric): number {
  const planLimits = PLAN_QUOTAS[plan as keyof typeof PLAN_QUOTAS];
  if (!planLimits) {
    throw new Error(`Unknown plan: ${plan}`);
  }
  const limit = planLimits[metric];
  if (limit === undefined) {
    throw new Error(`Unknown metric: ${metric} for plan ${plan}`);
  }
  return limit;
}

/**
 * Calculate next reset time based on period
 */
export function calculateResetAt(period: QuotaPeriod, periodStart: string): Date {
  const start = new Date(periodStart);
  let reset: Date;

  switch (period) {
    case QuotaPeriod.HOURLY:
      reset = new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate(),
        start.getUTCHours() + 1,
        0, 0, 0
      ));
      break;
    case QuotaPeriod.DAILY:
      reset = new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      break;
    case QuotaPeriod.MONTHLY:
      // First day of next month
      reset = new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth() + 1,
        1, 0, 0, 0, 0
      ));
      break;
    default:
      throw new Error(`Unknown quota period: ${period}`);
  }

  return reset;
}
