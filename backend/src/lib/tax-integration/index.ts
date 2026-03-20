/**
 * Tax Integration Service
 * Provides tax calculation and configuration management for usage-based billing
 */

import { prisma } from '../prisma';
import type { TaxConfig, TaxCalculationResult, TaxLineItem } from './types';

/**
 * Get tax configuration for an organization
 */
export async function getTaxConfig(orgId: string): Promise<TaxConfig | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { taxRate: true, taxName: true, taxId: true },
  });

  if (!org || org.taxRate === null || org.taxRate === undefined) {
    return null;
  }

  return {
    orgId,
    taxRate: org.taxRate,
    taxName: org.taxName || 'Tax',
    taxId: org.taxId || undefined,
  };
}

/**
 * Calculate tax amount from pre-tax amount
 */
export function calculateTaxAmount(preTaxCents: number, taxRatePercent: number): number {
  if (taxRatePercent <= 0) return 0;
  // Round to nearest cent (kobo) to avoid fractional currency
  return Math.round((preTaxCents * taxRatePercent) / 100);
}

/**
 * Create tax line item for payment request
 */
export function createTaxLineItem(taxConfig: TaxConfig, taxAmountCents: number): TaxLineItem {
  return {
    description: `${taxConfig.taxName} (${taxConfig.taxRate}%)`,
    amountCents: taxAmountCents,
  };
}

/**
 * Full tax calculation: given pre-tax amount, return breakdown
 */
export function calculateTax(preTaxCents: number, taxConfig: TaxConfig | null): TaxCalculationResult {
  if (!taxConfig) {
    return {
      preTaxAmount: preTaxCents,
      taxAmount: 0,
      totalAmount: preTaxCents,
      taxRate: 0,
      taxName: 'No Tax',
    };
  }

  const taxAmount = calculateTaxAmount(preTaxCents, taxConfig.taxRate);
  return {
    preTaxAmount: preTaxCents,
    taxAmount,
    totalAmount: preTaxCents + taxAmount,
    taxRate: taxConfig.taxRate,
    taxName: taxConfig.taxName,
  };
}

/**
 * Update tax configuration for an organization (admin use)
 */
export async function updateTaxConfig(
  orgId: string,
  taxRate: number | null,
  taxName?: string | null,
  taxId?: string | null
): Promise<TaxConfig> {
  const updates: { taxRate?: number | null; taxName?: string | null; taxId?: string | null } = { taxRate };

  if (taxName !== undefined) updates.taxName = taxName;
  if (taxId !== undefined) updates.taxId = taxId;

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: updates,
    select: { taxRate: true, taxName: true, taxId: true },
  });

  if (org.taxRate === null || org.taxRate === undefined) {
    throw new Error('Tax rate must be set to a positive number');
  }

  return {
    orgId,
    taxRate: org.taxRate,
    taxName: org.taxName || 'Tax',
    taxId: org.taxId || undefined,
  };
}

/**
 * Health check for tax service
 */
export function healthCheck(): boolean {
  return true;
}
