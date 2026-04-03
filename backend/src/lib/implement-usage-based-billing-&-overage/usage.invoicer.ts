/**
 * Usage Billing - Invoice Generator
 * Generates invoices for overage usage via Paystack
 */

import { prisma } from '../prisma';
import { paymentApiCallsTotal, usageRecordingDuration } from './metrics';
import { generateUsageInvoice } from './invoice.operations';
import { createPaymentRequest, finalizePaymentRequest, sendPaymentRequest } from './payment-request.operations';
import { getTaxConfig } from '../tax-integration';
import type { Quota } from './types';

// Static quota configuration based on plan (duplicate from recorder for separation)
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
 * Generate invoice for current billing period
 * Creates a Paystack payment request for overage charges
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
      org.email || 'billing@example.com',
      currentUsage,
      taxConfig?.taxRate,
      taxConfig?.taxName
    );

    // Record invoice in database (log for now)
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
