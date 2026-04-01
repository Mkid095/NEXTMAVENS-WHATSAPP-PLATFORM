/**
 * Invoice Service - Type Definitions
 * Types for invoice creation and management
 */

import type { Invoice, InvoiceItem } from '@prisma/client';

/**
 * Input for creating a new invoice
 */
export interface CreateInvoiceInput {
  orgId: string;
  customerName: string;
  customerEmail: string;
  stripeInvoiceId?: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  currency?: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID';
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
}

/**
 * Invoice with included line items
 */
export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}
