/**
 * Quota Calculator
 * Handles quota checking and overage cost calculation
 */

import { Quota, QuotaCheckResult, OverageCharge } from './types';

/**
 * Check if proposed usage would exceed quota
 */
export function checkQuota(
  currentUsage: number,
  proposedValue: number,
  quota: Quota
): QuotaCheckResult {
  const totalAfterUsage = currentUsage + proposedValue;
  const available = quota.includedUnits - totalAfterUsage;
  const withinQuota = totalAfterUsage <= quota.includedUnits;

  return {
    withinQuota,
    currentUsage,
    quotaLimit: quota.includedUnits,
    available,
    overageRateCents: quota.overageRateCents,
    estimatedOverageCostCents: withinQuota
      ? 0
      : Math.abs(available) * quota.overageRateCents,
  };
}

/**
 * Calculate overage charge for given usage
 */
export function calculateOverage(
  currentUsage: number,
  quota: Quota
): OverageCharge | null {
  if (currentUsage <= quota.includedUnits) {
    return null;
  }

  const overageUnits = currentUsage - quota.includedUnits;
  const totalCents = overageUnits * quota.overageRateCents;

  return {
    orgId: '', // to be filled by caller
    customerId: '', // to be filled by caller
    meterName: quota.meterName,
    overageUnits,
    rateCents: quota.overageRateCents,
    totalCents,
    currency: quota.currency || 'usd',
    periodStart: new Date(),
    periodEnd: new Date(),
  };
}

/**
 * Format overage charge as human-readable string
 */
export function formatOverageCharge(charge: OverageCharge): string {
  const dollars = (charge.totalCents / 100).toFixed(2);
  return `${charge.overageUnits} units @ ${(charge.rateCents / 100).toFixed(2)}/unit = $${dollars}`;
}

/**
 * Calculate effective rate including overage
 */
export function calculateEffectiveRate(
  quota: Quota,
  actualUsage: number
): number {
  const baseValue = quota.includedUnits * (quota.overageRateCents || 0);
  const overage = actualUsage > quota.includedUnits
    ? (actualUsage - quota.includedUnits) * quota.overageRateCents
    : 0;
  const totalCents = baseValue + overage;
  return totalCents / actualUsage;
}
