/**
 * Paystack Invoice Operations
 * High-level operations for generating and sending usage invoices
 */

import { createPaymentRequest } from './payment-request.operations';
import type { PaystackPaymentRequest } from './paystack.types';

/**
 * Create invoice items from accumulated usage and generate a payment request
 *
 * @param orgId - Organization ID
 * @param meterName - Meter name (e.g., 'api_requests')
 * @param periodStart - Billing period start
 * @param periodEnd - Billing period end
 * @param overageRateCents - Cost per unit in cents (will be converted to kobo)
 * @param includedUnits - Quota included units
 * @param orgName - Organization name for description
 * @param customerEmail - Customer email for invoice
 * @param totalUsage - Total usage in current period
 * @param taxRatePercent - Optional tax rate percentage
 * @param taxName - Optional tax name (e.g., "VAT 7.5%")
 *
 * @returns Payment request details
 */
export async function generateUsageInvoice(
  orgId: string,
  meterName: string,
  periodStart: Date,
  periodEnd: Date,
  overageRateCents: number,
  includedUnits: number,
  orgName: string,
  customerEmail: string,
  totalUsage: number,
  taxRatePercent?: number,
  taxName?: string
): Promise<PaystackPaymentRequest> {
  // Calculate overage
  const overageUnits = Math.max(0, totalUsage - includedUnits);
  const overageAmountCents = overageUnits * overageRateCents;
  const overageAmountKobo = Math.round(overageAmountCents / 100); // Convert cents to kobo (NGN)

  // Calculate tax if applicable
  let taxAmountKobo: number | undefined;
  if (taxRatePercent && taxRatePercent > 0) {
    const taxAmountCents = Math.round(overageAmountCents * taxRatePercent / 100);
    taxAmountKobo = Math.round(taxAmountCents / 100);
  }

  // Build line items
  const lineItems: Array<{ name: string; amountKobo: number; quantity: number }> = [];

  if (overageAmountKobo > 0) {
    lineItems.push({
      name: `${meterName} overage (${overageUnits} units)`,
      amountKobo: overageAmountKobo,
      quantity: 1,
    });
  }

  // If total usage is 0, no invoice needed
  if (lineItems.length === 0) {
    throw new Error('No billable usage for this period');
  }

  const description = `Usage billing for ${orgName} - ${meterName} (${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`;

  // Prepare tax payload if applicable
  const taxPayload = taxAmountKobo && taxName ? [{ name: `${taxName} (${taxRatePercent}%)`, amount: taxAmountKobo }] : undefined;

  // Create payment request in draft mode first
  const paymentRequest = await createPaymentRequest(
    customerEmail,
    description,
    lineItems,
    {
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      draft: true, // Create as draft, can be finalized later
      tax: taxPayload,
      metadata: {
        orgId,
        meterName,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalUsage,
        includedUnits,
        overageUnits,
        ...(taxRatePercent && { taxRatePercent }),
        ...(taxAmountKobo && { taxAmountKobo }),
      },
    }
  );

  return paymentRequest;
}

/**
 * Finalize and send an invoice
 */
export async function finalizeAndSendInvoice(requestCode: string): Promise<PaystackPaymentRequest> {
  const { finalizePaymentRequest, sendPaymentRequest } = await import('./payment-request.operations');
  const finalized = await finalizePaymentRequest(requestCode);
  const sent = await sendPaymentRequest(requestCode);
  return sent;
}
