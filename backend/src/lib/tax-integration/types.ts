/**
 * Tax Integration Types
 * Handles VAT, GST, Sales Tax calculations for invoices
 */

export interface TaxConfig {
  orgId: string;
  taxRate: number; // percentage (e.g., 7.5 for 7.5%)
  taxName: string; // e.g., "VAT", "GST", "Sales Tax"
  taxId?: string; // optional tax registration number
}

export interface TaxCalculationResult {
  preTaxAmount: number; // in cents
  taxAmount: number; // in cents
  totalAmount: number; // in cents
  taxRate: number;
  taxName: string;
}

export interface TaxLineItem {
  description: string;
  amountCents: number;
}
