/**
 * Usage Service
 * Core business logic for usage-based billing and overage tracking
 * Integrated with Paystack for invoice generation
 */

import { prisma } from '../prisma';
import {
  usageEventsTotal,
  currentUsageGauge,
  quotaRemainingGauge,
  overageChargesCentsTotal,
  usageRecordingDuration,
  paymentApiCallsTotal,
} from './metrics';
import { checkQuota, calculateOverage } from './quota-calculator';
import { generateUsageInvoice } from './paystack-client';
import type {
  UsageEvent,
  RecordUsageInput,
  RecordUsageResult,
  UsageAnalytics,
  Quota,
} from './types';
import { getTaxConfig } from '../tax-integration';

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

    // Update metrics
    const newTotal = currentUsage + input.value;
    currentUsageGauge.set({ org_id: orgId, meter_name: meterName }, newTotal);
    quotaRemainingGauge.set({ org_id: orgId, meter_name: meterName }, quota.includedUnits - newTotal);
    usageEventsTotal.inc({ org_id: orgId, meter_name: meterName });

    const duration = (performance.now() - startTime) / 1000;
    usageRecordingDuration.observe({ meter_name: meterName }, duration);

    return {
      success: true,
      eventId: usageEvent.id,
      currentUsage: newTotal,
      quotaRemaining: quota.includedUnits - newTotal,
      overageWarning: !quotaResult.withinQuota,
      message: quotaResult.withinQuota ? undefined : `Over quota by ${quotaResult.available * -1} units`,
    };
  } catch (error: any) {
    const duration = (performance.now() - startTime) / 1000;
    usageRecordingDuration.observe({ meter_name: meterName }, duration);
    throw error;
  }
}

/**
 * Generate an invoice for the current billing period via Paystack
 * Creates a payment request with overage charges
 */
export async function generatePeriodInvoice(orgId: string, meterName: string): Promise<{
  success: boolean;
  paymentRequestId?: number;
  requestCode?: string;
  amountKobo?: number;
  message?: string;
}> {
  const startTime = performance.now();
  try {
    // Fetch organization
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    // Get quota
    const planQuota = PLAN_QUOTAS[org.plan]?.[meterName];
    if (!planQuota) {
      throw new Error(`No quota defined for plan ${org.plan} and meter ${meterName}`);
    }

    // Get current period usage
    const period = getCurrentCalendarPeriod();
    const currentUsage = await getCurrentUsageFromDB(orgId, meterName, period.periodStart);

    // Check if there's any overage to bill
    if (currentUsage <= planQuota.includedUnits) {
      return {
        success: true,
        message: 'No overage to invoice for this period',
      };
    }

    // Fetch tax configuration (if any)
    const taxConfig = await getTaxConfig(orgId);

    // Generate invoice via Paystack
    const paymentRequest = await generateUsageInvoice(
      orgId,
      meterName,
      period.periodStart,
      period.periodEnd,
      planQuota.overageRateCents,
      planQuota.includedUnits,
      org.name,
      org.email || 'billing@example.com', // TODO: use actual customer email
      currentUsage,
      taxConfig?.taxRate,
      taxConfig?.taxName
    );

    // Record invoice in our database (we'll need an Invoice model from Step 4)
    // For now, log the payment request details
    console.log(`[UsageService] Generated payment request ${paymentRequest.request_code} for ${orgId}: ${paymentRequest.amount} kobo`);

    paymentApiCallsTotal.inc({ endpoint: 'paymentrequest.create', status: 'success' });

    const duration = (performance.now() - startTime) / 1000;
    usageRecordingDuration.observe({ meter_name: meterName }, duration);

    return {
      success: true,
      paymentRequestId: paymentRequest.id,
      requestCode: paymentRequest.request_code,
      amountKobo: paymentRequest.amount,
      message: `Invoice created: ${paymentRequest.invoice_number}`,
    };
  } catch (error: any) {
    paymentApiCallsTotal.inc({ endpoint: 'paymentrequest.create', status: 'error' });
    const duration = (performance.now() - startTime) / 1000;
    usageRecordingDuration.observe({ meter_name: meterName }, duration);
    throw error;
  }
}

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
