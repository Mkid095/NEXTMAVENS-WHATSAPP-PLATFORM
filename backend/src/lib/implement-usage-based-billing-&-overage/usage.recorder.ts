/**
 * Usage Billing - Usage Recorder
 * Handles recording usage events and tracking against quotas
 */

import { prisma } from '../prisma';
import {
  usageEventsTotal,
  currentUsageGauge,
  quotaRemainingGauge,
  overageChargesCentsTotal,
  usageRecordingDuration,
} from './metrics';
import { checkQuota } from './quota-calculator';
import type {
  UsageEvent,
  RecordUsageInput,
  RecordUsageResult,
  Quota,
} from './types';

// Static quota configuration based on plan
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
 * Record a usage event
 */
export async function recordUsage(input: RecordUsageInput): Promise<RecordUsageResult> {
  const startTime = performance.now();
  const meterName = input.meterName;

  try {
    if (input.value <= 0) {
      throw new Error('Usage value must be positive');
    }

    const timestamp = input.timestamp || new Date();
    const orgId = input.orgId;

    // Fetch organization to get plan and contact info
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    // Get quota for this meter from plan
    const planQuota = PLAN_QUOTAS[org.plan]?.[meterName];
    if (!planQuota) {
      throw new Error(`No quota defined for plan ${org.plan} and meter ${meterName}`);
    }
    const quota: Quota = {
      planId: org.plan,
      meterName,
      includedUnits: planQuota.includedUnits,
      overageRateCents: planQuota.overageRateCents,
      currency: 'usd', // Base currency in cents
    };

    // Get current period (calendar month)
    const period = getCurrentCalendarPeriod();
    const currentUsage = await getCurrentUsageFromDB(orgId, meterName, period.periodStart);

    // Check quota
    const quotaResult = checkQuota(currentUsage, input.value, quota);

    if (!quotaResult.withinQuota) {
      overageChargesCentsTotal.inc({ org_id: orgId, meter_name: meterName });
    }

    // Save usage event
    const usageEvent = await prisma.usageEvent.create({
      data: {
        orgId,
        customerId: input.customerId || orgId,
        meterName,
        value: input.value,
        recordedAt: timestamp,
        metadata: input.metadata,
      },
    });

    // Compute post-usage values
    const currentAfter = currentUsage + input.value;
    const remaining = Math.max(0, quota.includedUnits - currentAfter);
    const overageAmountCents = quotaResult.estimatedOverageCostCents || 0;

    // Update gauges
    currentUsageGauge.labels(orgId, meterName).set(currentAfter);
    quotaRemainingGauge.labels(orgId, meterName).set(remaining);

    const duration = performance.now() - startTime;
    usageRecordingDuration.labels({ meter_name: meterName }).observe(duration);

    return {
      success: true,
      eventId: usageEvent.id,
      currentUsage: currentAfter,
      quotaRemaining: remaining,
      overageWarning: !quotaResult.withinQuota,
      message: `Overage: ${overageAmountCents} cents`,
    };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    usageRecordingDuration.labels({ meter_name: meterName }).observe(duration);

    return {
      success: false,
      message: error.message,
    };
  }
}

// Helper: Get current calendar period (month start to month end)
function getCurrentCalendarPeriod(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { periodStart, periodEnd };
}

// Helper: Get current usage from DB for a meter since periodStart
async function getCurrentUsageFromDB(orgId: string, meterName: string, periodStart: Date): Promise<number> {
  const result = await prisma.usageEvent.aggregate({
    where: {
      orgId,
      meterName,
      recordedAt: { gte: periodStart },
    },
    _sum: {
      value: true,
    },
  });

  return result._sum.value || 0;
}
